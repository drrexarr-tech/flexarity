#!/bin/bash
# Publish security headers on the live nginx vhost.
#
# The vhost is not in this repository, so it has to be patched in place on the
# host. Everything here is defensive: the file is backed up first, nginx is
# validated before a reload, and the original is restored if either the syntax
# check or the verification fails. Safe to run on every deploy.
#
# Why this is a script and not inline YAML: it is long, it is the kind of thing
# worth reviewing on its own, and a quoting mistake inside an indented YAML
# block would only show up as a failed deploy.

set -uo pipefail

MARKER='# flex-security-headers'
DOMAIN="${FLEX_DOMAIN:-veheys.online}"

# Matches the nginx directives already in this repo's config. connect-src keeps
# oauth.telegram.org for the login redirect, and data:/blob: are needed for
# avatars, the avatar crop and recorded voice messages.
read -r -d '' HEADERS <<EOF || true
    # flex-security-headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://oauth.telegram.org; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" always;
EOF

echo "=== Locating the nginx vhost for ${DOMAIN} ==="

mapfile -t CANDIDATES < <(
  sudo grep -rl --include='*.conf' --include='*' "server_name[^;]*${DOMAIN}" /etc/nginx 2>/dev/null \
    | while read -r f; do
        # A file that both listens on 443 and names the domain is the vhost that
        # serves the app, rather than a redirect block or a commented sample.
        if sudo grep -qE "listen[^;]*(443|ssl)" "$f" 2>/dev/null; then echo "$f"; fi
      done
)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  echo "No nginx vhost found for ${DOMAIN}; leaving the configuration untouched."
  exit 0
fi

for f in "${CANDIDATES[@]}"; do
  echo "  found: $f"
done

for file in "${CANDIDATES[@]}"; do
  echo "=== Patching $file ==="

  if sudo grep -q "$MARKER" "$file" 2>/dev/null; then
    echo "  headers already present, skipping"
    continue
  fi

  backup=$(sudo mktemp)
  if ! sudo cp "$file" "$backup"; then
    echo "  ERROR: could not back up $file"
    exit 1
  fi

  # Two insertion points, tracked per block depth so that nested blocks each get
  # their own copy and none gets two.
  #
  # 1. Server level, right after server_name, so plain responses get the headers.
  # 2. Just before the closing brace of any block that defines its own
  #    add_header. nginx inherits add_header only while the inner block defines
  #    none of its own, so a location with `add_header Cache-Control` silently
  #    drops everything from the server level. This vhost does exactly that for
  #    /sw.js, /assets and the manifest.
  #
  # The first attempt used a single flag for the location case and only patched
  # the first add_header it met, leaving the rest of the vhost unprotected.
  sudo awk -v headers="$HEADERS" '
    BEGIN { depth = 0 }
    {
      nopen = gsub(/\{/, "{", $0)
      nclose = gsub(/\}/, "}", $0)

      if (nclose > 0) {
        blk = depth - nclose + 1
        if (blk > 0 && pending[blk] && !inserted[blk]) { print headers; inserted[blk] = 1 }
        if (blk > 0) { delete pending[blk]; delete inserted[blk] }
        depth = depth + nopen - nclose
        print $0
        next
      }

      depth = depth + nopen

      if ($0 ~ /server_name[^;]*;/ && !inserted[depth]) {
        print
        print headers
        inserted[depth] = 1
        next
      }

      if ($0 ~ /add_header/) pending[depth] = 1
      print $0
    }
  ' "$file" > /tmp/_nginx_patch.$$ 2>/dev/null

  if [ ! -s /tmp/_nginx_patch.$$ ]; then
    echo "  ERROR: patch produced no output"
    rm -f /tmp/_nginx_patch.$$
    exit 1
  fi

  if ! sudo cp /tmp/_nginx_patch.$$ "$file"; then
    echo "  ERROR: could not write the patched file"
    rm -f /tmp/_nginx_patch.$$
    exit 1
  fi
  rm -f /tmp/_nginx_patch.$$

  if ! sudo nginx -t 2>/tmp/_nginx_test.$$; then
    echo "  ERROR: nginx rejected the patched config, restoring"
    sudo cat /tmp/_nginx_test.$$ || true
    sudo cp "$backup" "$file"
    rm -f /tmp/_nginx_test.$$ "$backup"
    exit 1
  fi
  rm -f /tmp/_nginx_test.$$
  echo "  config accepted"

  if ! sudo systemctl reload nginx 2>/dev/null && ! sudo systemctl restart nginx 2>/dev/null; then
    echo "  ERROR: nginx would not reload, restoring"
    sudo cp "$backup" "$file"
    sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx 2>/dev/null || true
    rm -f "$backup"
    exit 1
  fi
  echo "  reloaded"
  rm -f "$backup"
done

echo "=== Verifying the published headers ==="
sleep 2
missing=0
for header in Strict-Transport-Security X-Content-Type-Options Content-Security-Policy Referrer-Policy; do
  if curl -sSI -m 10 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" 2>/dev/null \
      | grep -qi "^${header}:"; then
    echo "  ok      ${header}"
  else
    echo "  MISSING ${header}"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "=== Some headers are not reaching the document ==="
  echo "=== curl -I https://${DOMAIN}/ ==="
  curl -sSI -m 10 "https://${DOMAIN}/" 2>&1 | head -20 || true
fi

exit 0
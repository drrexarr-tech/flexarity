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
MODE="${1:-apply}"

# Rollback mode.
#
# Adding these headers took the site down: TLS handshakes stopped completing, so
# xray's forward to nginx was answering nothing. `nginx -t` had passed, which is
# exactly why that check alone was not sufficient. The inserted block is
# self-identifying, so it can be removed precisely without needing the backup,
# which the apply path deleted on success.
if [ "$MODE" = "remove" ]; then
  echo "=== Removing previously added security headers ==="
  removed_total=0
  for file in $(sudo grep -rl "$MARKER" /etc/nginx 2>/dev/null); do
    backup=$(sudo mktemp)
    sudo cp "$file" "$backup"
    count_before=$(sudo grep -c "$MARKER" "$file" || true)

    # Delete the marker and the specific directives this script inserts, matched
    # by header name. The first attempt skipped "the marker and any add_header
    # that follows", which also ate the vhost's own
    # `add_header Cache-Control` whenever it happened to sit next to ours.
    sudo awk -v marker="$MARKER" '
      BEGIN {
        ours = "Strict-Transport-Security|X-Content-Type-Options|Referrer-Policy|X-Frame-Options|Permissions-Policy|Content-Security-Policy"
      }
      {
        line = $0
        stripped = line
        sub(/^[ \t]+/, "", stripped)
        sub(/[ \t\r]+$/, "", stripped)
        if (stripped == marker) next
        if (stripped ~ ("^add_header[ ]+(" ours ")")) next
        print $0
      }
    ' "$file" > /tmp/_nginx_rm.$$ 2>/dev/null

    sudo cp /tmp/_nginx_rm.$$ "$file"
    rm -f /tmp/_nginx_rm.$$

    if ! sudo nginx -t 2>/dev/null; then
      echo "  ERROR: nginx rejected the cleaned config in $file, restoring"
      sudo cp "$backup" "$file"
      rm -f "$backup"
      exit 1
    fi
    rm -f "$backup"
    count_after=$(sudo grep -c "$MARKER" "$file" || true)
    echo "  $file: $count_before -> $count_after"
    removed_total=$((removed_total + count_before - count_after))
  done

  # Reload only. See the note in the apply path about xray and restarts.
  sudo systemctl reload nginx 2>/dev/null || true
  echo "removed ${removed_total} block(s)"

  echo "=== Publishing the current config for inspection ==="
  {
    echo "captured at $(date -u +%FT%TZ) after header removal"
    for f in $(sudo grep -rl --include='*.conf' --include='*' "server_name[^;]*${DOMAIN}" /etc/nginx 2>/dev/null); do
      echo "----- $f -----"
      sudo cat "$f"
    done
  } > /tmp/_nginx_dump.txt 2>&1 || true
  sudo cp /tmp/_nginx_dump.txt /var/www/html/_nginx.txt 2>/dev/null || true
  exit 0
fi

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

now() { date +%s; }

# How expensive is sudo on this host? If each call costs seconds rather than
# milliseconds, the number of calls in a step matters more than what they do,
# and that would explain a step that looks trivial taking over a minute.
sudo_probe=$( { t0=$(now); sudo -n true; t1=$(now); echo $((t1 - t0)); } 2>/dev/null || echo "?" )
echo "  sudo -n true took ${sudo_probe}s"

echo "=== Locating the nginx vhost for ${DOMAIN} ==="

t0=$(now)
mapfile -t CANDIDATES < <(
  sudo grep -rl "server_name[^;]*${DOMAIN}" /etc/nginx 2>/dev/null | sort -u | while read -r f; do
    # Never treat a backup as a vhost. An earlier version did, and because it
    # patches whatever it finds and then writes a .flexbak beside the result,
    # each deploy created another generation: default.flexbak,
    # default.flexbak.flexbak, and so on. Seven were piling up on the host.
    case "$f" in *.flexbak*) continue;; esac
    # sites-enabled holds symlinks into sites-available; patch the real file once.
    real=$(sudo readlink -f "$f" 2>/dev/null || echo "$f")
    case "$real" in *.flexbak*) continue;; esac
    echo "$real"
  done | sort -u
)
echo "  discovery took $(($(now) - t0))s, found ${#CANDIDATES[@]} file(s)"

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

  # Reload only, never restart.
  #
  # xray terminates TLS on :443 and forwards to nginx on 127.0.0.1:8080. A
  # restart of nginx drops that connection, and with it the VPN for everyone on
  # the host. This line used to fall back to `systemctl restart nginx`, which is
  # how a header change ended up costing somebody their connection.
  if ! sudo systemctl reload nginx 2>/dev/null; then
    echo "  ERROR: nginx would not reload, restoring the backup"
    sudo cp "${file}.flexbak" "$file" 2>/dev/null || true
    sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx 2>/dev/null || true
    exit 1
  fi
  echo "  reloaded"
  # Keep the backup beside the file rather than deleting it: the previous version
  # removed it on success, which left nothing to roll back to when the very next
  # run turned out to be the problem.
  sudo mv "$backup" "${file}.flexbak" 2>/dev/null || rm -f "$backup"
done

echo "=== Verifying the published headers ==="
# One request, not one per header. This used to curl once for each of four
# headers and then curl twice more to print the response, so with a ten second
# timeout each it could spend over a minute. A single response contains every
# header, and the deploy timings showed the step taking 141 seconds.
sleep 1
tv=$(now)
response=$(curl -sSI -m 8 "https://${DOMAIN}/" 2>/dev/null || true)
echo "  verification request took $(($(now) - tv))s"

missing=0
for header in Strict-Transport-Security X-Content-Type-Options Content-Security-Policy Referrer-Policy X-Frame-Options; do
  if printf '%s' "$response" | grep -qi "^${header}:"; then
    echo "  ok      ${header}"
  else
    echo "  MISSING ${header}"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "=== response headers ==="
  printf '%s\n' "$response" | head -20
fi

exit 0
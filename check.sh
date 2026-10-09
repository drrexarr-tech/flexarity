#!/bin/bash
# Read-only diagnostics. Safe to run at any time; changes nothing.
#   bash check.sh
set -uo pipefail

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

head_ "System"
df -h / | tail -1 | awk '{print "  disk /      : " $5 " used, " $4 " free"}'
free -h | awk '/^Mem:/ {print "  memory      : " $3 " used of " $2}'
echo "  load        : $(cut -d' ' -f1-3 /proc/loadavg)"
echo "  uptime      : $(uptime -p)"

head_ "Services"
for svc in nginx docker; do
  if systemctl is-active --quiet "$svc"; then ok "$svc active"; else bad "$svc inactive"; fi
done

head_ "Docker"
echo "  $(docker --version 2>/dev/null || echo 'docker: not found')"
echo "  $(docker compose version 2>/dev/null || echo 'compose plugin: not installed')"
echo
docker ps -a --format '  {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || warn "cannot list containers"

head_ "Ports"
for p in 80 443 3001 5432; do
  holder=$(sudo ss -tlnp 2>/dev/null | grep -E "[:.]${p}[[:space:]]" | head -1)
  if [ -n "$holder" ]; then
    echo "  $p  $holder" | sed 's/users:/\n         users:/'
  else
    warn "port $p is not listening"
  fi
done

head_ "Server binary vs deployed commit"
running_in="none"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx flex-server; then
  running_in="container"
elif curl -fsS --max-time 3 http://localhost:3001/api/health >/dev/null 2>&1; then
  running_in="host"
fi
echo "  API running in: $running_in"

case "$running_in" in
  container)
    health=$(docker inspect flex-server --format '{{.State.Health.Status}}' 2>/dev/null)
    if [ "$health" = "healthy" ]; then ok "container healthy"; else warn "container health: $health"; fi
    if docker exec flex-server test -f /app/dist/lib/validation.js 2>/dev/null; then
      ok "container has the null-tolerant schemas"
    else
      bad "container MISSING dist/lib/validation.js — stale image"
    fi
    ;;
  host)
    if [ -f /opt/flex/server/dist/lib/validation.js ]; then
      ok "host build contains the null-tolerant schemas"
    else
      bad "host build MISSING lib/validation.js — stale binary"
    fi
    ;;
  *)
    bad "API not answering"
    ;;
esac

head_ "Web root growth"
echo "  /var/www/html: $(du -sh /var/www/html 2>/dev/null | cut -f1)"
echo "  hashed assets: $(find /var/www/html -maxdepth 2 -type f -name '*.js' 2>/dev/null | wc -l) js, $(find /var/www/html -maxdepth 2 -type f -name '*.css' 2>/dev/null | wc -l) css"
echo "  built now   : $(find /opt/flex/client/dist -maxdepth 2 -type f -name '*.js' 2>/dev/null | wc -l) js"

head_ "API"
if resp=$(curl -fsS --max-time 5 http://localhost:3001/api/health 2>&1); then
  ok "direct      $resp"
else
  bad "direct      $resp"
fi
if resp=$(curl -fsS --max-time 5 https://veheys.online/api/health 2>&1); then
  ok "via nginx   $resp"
else
  bad "via nginx   $resp"
fi

head_ "Upload path traversal (must NOT return .env)"
probe=$(curl -s --max-time 5 'https://veheys.online/api/upload/file/..%2F..%2F.env')
if printf '%s' "$probe" | grep -q 'DATABASE_URL'; then
  bad "TRAVERSAL WORKS — .env is publicly readable, fix this now"
else
  ok "blocked     $(printf '%s' "$probe" | head -c 80)"
fi

head_ "Database"
if docker exec flex-postgres pg_isready -U flex -d flexdb >/dev/null 2>&1; then
  ok "flex-postgres accepting connections"
  echo "  volume: $(docker inspect flex-postgres --format '{{range .Mounts}}{{.Name}}{{.Source}}{{end}}' 2>/dev/null)"
  echo "  rows:"
  docker exec flex-postgres psql -U flex -d flexdb -tAc \
    "SELECT '    ' || relname || ' = ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" 2>/dev/null \
    | grep -v '^ *$' || warn "could not read row counts"
else
  bad "flex-postgres not reachable"
fi

head_ "Uploads volume"
if [ -d /opt/flex/server/uploads ]; then
  echo "  files: $(find /opt/flex/server/uploads -type f | wc -l)"
  echo "  size : $(du -sh /opt/flex/server/uploads 2>/dev/null | cut -f1)"
  echo "  mount: $(sudo docker inspect flex-server --format '{{range .Mounts}}{{.Source}}{{end}}' 2>/dev/null || echo 'container absent')"
else
  warn "uploads directory missing"
fi

head_ "Secrets"
if [ -f /opt/flex/server/.env ]; then
  perms=$(stat -c '%a %U' /opt/flex/server/.env)
  echo "  server/.env present ($perms)"
  missing=""
  for key in DATABASE_URL JWT_SECRET POSTGRES_PASSWORD; do
    grep -qE "^${key}=.+" /opt/flex/server/.env || missing="$missing $key"
  done
  [ -n "$missing" ] && bad "missing values:$missing" || ok "required keys present"
else
  bad "server/.env missing"
fi

head_ "Deployed commit"
echo "  $(cd /opt/flex && git rev-parse --short HEAD 2>/dev/null) $(cd /opt/flex && git log -1 --format=%s 2>/dev/null)"
if git -C /opt/flex diff --quiet HEAD -- 2>/dev/null; then
  ok "working tree clean"
else
  warn "working tree has local modifications — they will be wiped on deploy"
fi

head_ "Recent server logs"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx flex-server; then
  docker logs --tail 15 flex-server 2>&1 | sed 's/^/  /'
elif [ -f /tmp/flex-server.log ]; then
  tail -n 15 /tmp/flex-server.log | sed 's/^/  /'
else
  warn "no server logs found"
fi

echo
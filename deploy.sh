#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
#
# Раскладка: nginx и TLS — на хосте (443 занят xray), статика клиента
# копируется в /var/www/html, postgres — отдельный контейнер. API
# предпочтительно живёт в Docker (restart: unless-stopret), но Compose может
# быть не установлен, а контейнер — не подняться; тогда скрипт уходит на
# хостовый запуск и оставляет сайт живым в любом случае.
#
# Схема Prisma применяется НА ХОСТЕ: docker compose run с переопределением
# команды на этой версии Compose игнорировал её и запускал CMD, из-за чего
# деплой падал на EADDRINUSE.
set -euo pipefail

cd /opt/flex

if [ ! -f server/.env ]; then
  echo "ERROR: /opt/flex/server/.env not found (see server/.env.example)"
  exit 1
fi

echo "=== Loading secrets from server/.env ==="
set -a
. /opt/flex/server/.env
set +a

echo "=== Pulling latest code ==="
git fetch origin && git reset --hard origin/main

echo "=== Building client ==="
cd /opt/flex/client
npm install --silent
npm run build
sudo cp -r dist/* /var/www/html/

echo "=== Removing stale web assets ==="
# Every build emits a new hashed bundle name and nothing ever deleted the old
# one, so the web root grew by a full copy per deploy. Remove only what the
# current build did not produce: files outside the app build (templates,
# images/, index.nginx-debian.html) must stay untouched.
if [ -d /opt/flex/client/dist/assets ]; then
  ( cd /opt/flex/client/dist/assets && find . -type f -printf '%P\n' ) | while read -r rel; do
    [ -e "/opt/flex/client/dist/assets/$rel" ] || sudo rm -f "/var/www/html/assets/$rel"
  done
fi
sudo find /var/www/html -maxdepth 1 -name 'workbox-*.js' -type f 2>/dev/null | while read -r f; do
  base=$(basename "$f")
  [ -e "/opt/flex/client/dist/$base" ] || sudo rm -f "$f"
done

echo "=== Pruning dangling images ==="
# Targets only untagged leftovers from previous builds. `image prune -a` would
# delete the postgres image, which must survive a server reboot.
docker image prune -f >/dev/null 2>&1 || true

echo "=== Ensuring uploads volume exists ==="
mkdir -p /opt/flex/server/uploads

cd /opt/flex/server

echo "=== Prisma client and schema ==="
npm install --silent
npx prisma generate
npx prisma db push --accept-data-loss

port_3001_busy() {
  # Capture into a variable instead of piping into grep: with `set -o pipefail`
  # an early-exiting grep can SIGPIPE ss, turning a successful match into a
  # non-zero pipeline and reporting the port as free while it is still bound.
  local listeners
  listeners=$(sudo ss -tln 2>/dev/null || true)
  case "$listeners" in
    *:3001*) return 0 ;;
  esac
  return 1
}

release_port() {
  screen -X -S flex-server quit 2>/dev/null || true

  # Free the port by identifying whoever holds it, never by matching a command
  # pattern. `pkill -f "tsx watch"` terminated this script itself, because the
  # pattern also appears in the command line of the shell running it.
  for _ in $(seq 1 15); do
    if ! port_3001_busy; then return 0; fi
    sudo fuser -k -TERM 3001/tcp >/dev/null 2>&1 || true
    sleep 1
  done
  return 1
}

start_host() {
  npm run build
  release_port || true
  screen -dmS flex-server bash -c 'cd /opt/flex/server && exec node dist/index.js'
}

wait_api() {
  for _ in $(seq 1 40); do
    if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if docker compose version >/dev/null 2>&1; then
  echo "=== Compose available: deploying API as a container ==="

  cd /opt/flex
  docker compose build server
  docker compose stop server 2>/dev/null || true

  if ! release_port; then
    echo "ERROR: port 3001 is still busy, container would crash-loop."
    sudo ss -tlnp | grep 3001 || true
    exit 1
  fi
  echo "Port 3001 released"

  docker compose up -d server

  if wait_api; then
    echo "=== API is up (container) ==="
  else
    echo "=== WARNING: container did not come up, falling back to the host ==="
    docker compose ps || true
    docker compose logs --tail 50 server || true
    docker compose stop server 2>/dev/null || true
    sleep 2

    cd /opt/flex/server
    start_host
    if ! wait_api; then
      echo "ERROR: API is down in both modes."
    port_3001_busy && sudo ss -tlnp 2>/dev/null | grep 3001 || true
    screen -ls || true
      exit 1
    fi
    echo "=== API is up (host fallback) ==="
  fi
else
  echo "=== Compose plugin not available: deploying API on the host ==="
  echo "Install it for auto-restart:"
  echo "  sudo mkdir -p /usr/local/lib/docker/cli-plugins"
  echo "  sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose"
  echo "  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose"

  start_host
  if ! wait_api; then
    echo "ERROR: API did not come up."
    port_3001_busy && sudo ss -tlnp 2>/dev/null | grep 3001 || true
    screen -ls || true
    exit 1
  fi
  echo "=== API is up (host) ==="
fi

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="
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

echo "=== Ensuring uploads volume exists ==="
mkdir -p /opt/flex/server/uploads

cd /opt/flex/server

echo "=== Prisma client and schema ==="
npm install --silent
npx prisma generate
npx prisma db push --accept-data-loss

release_port() {
  screen -X -S flex-server quit 2>/dev/null || true
  pkill -f "tsx watch" 2>/dev/null || true
  for i in $(seq 1 15); do
    if ! sudo ss -tln | grep -q ':3001'; then return 0; fi
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
      sudo ss -tlnp | grep 3001 || true
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
    sudo ss -tlnp | grep 3001 || true
    screen -ls || true
    exit 1
  fi
  echo "=== API is up (host) ==="
fi

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="
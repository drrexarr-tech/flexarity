#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
#
# Раскладка: postgres и API — в docker (restart: unless-stopped),
# nginx и TLS — на хосте (443 занят xray). Статика клиента копируется в
# /var/www/html. Секреты — только из server/.env, в репозитории их нет.
#
# Compose v2 на сервере может отсутствовать, поэтому скрипт не требует его:
# без него API поднимается процессом на хосте, с ним — контейнером.
set -euo pipefail

cd /opt/flex

if [ ! -f server/.env ]; then
  echo "ERROR: /opt/flex/server/.env not found (see server/.env.example)"
  exit 1
fi

echo "=== Loading secrets from server/.env ==="
# Export into the shell rather than relying on `docker compose --env-file`:
# the flag only exists in newer Compose, and interpolation from the
# environment works on every version.
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

cd /opt/flex

if docker compose version >/dev/null 2>&1; then
  echo "=== Compose available: deploying API as a container ==="

  docker compose build server
  docker compose run --rm server \
    npx prisma db push --accept-data-loss --skip-generate

  # Release the port from every holder first: the container itself plus any
  # host process left from an older scheme. Otherwise the container starts,
  # dies on EADDRINUSE and, with restart: unless-stopped, crash-loops.
  docker compose stop server 2>/dev/null || true
  screen -X -S flex-server quit 2>/dev/null || true
  pkill -f "tsx watch" 2>/dev/null || true

  for i in $(seq 1 15); do
    if ! sudo ss -tln | grep -q ':3001'; then break; fi
    sleep 1
  done

  if sudo ss -tln | grep -q ':3001'; then
    echo "ERROR: port 3001 is still busy, container would crash-loop."
    sudo ss -tlnp | grep 3001 || true
    exit 1
  fi
  echo "Port 3001 released"

  docker compose up -d server
else
  echo "=== Compose v2 not available: deploying API on the host ==="
  echo "Install it for auto-restart: see docker-compose optional notes."

  cd /opt/flex/server
  npm install --silent
  npx prisma generate
  npx prisma db push --accept-data-loss
  npm run build

  screen -X -S flex-server quit 2>/dev/null || true
  pkill -f "tsx watch" 2>/dev/null || true
  sleep 2

  screen -dmS flex-server bash -c 'cd /opt/flex/server && exec node dist/index.js'
fi

echo "=== Waiting for API ==="
for i in $(seq 1 40); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "API is up"
    break
  fi
  if [ "$i" = "40" ]; then
    echo "ERROR: API did not come up."
    sudo ss -tlnp | grep 3001 || true
    if docker compose version >/dev/null 2>&1; then
      docker compose ps || true
      docker compose logs --tail 50 server || true
    fi
    screen -ls || true
    exit 1
  fi
  sleep 2
done

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

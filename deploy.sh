#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
#
# Раскладка: postgres и API — в docker (restart: unless-stopped),
# nginx и TLS — на хосте (443 занят xray). Статика клиента копируется в
# /var/www/html. Секреты — только из server/.env, в репозитории их нет.
set -e

cd /opt/flex

if [ ! -f server/.env ]; then
  echo "ERROR: /opt/flex/server/.env not found (see server/.env.example)"
  exit 1
fi

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

echo "=== Building API image ==="
docker compose --env-file server/.env build server

echo "=== Applying Prisma schema ==="
docker compose --env-file server/.env run --rm server \
  npx prisma db push --accept-data-loss --skip-generate

echo "=== Restarting API container ==="
# Сначала гасим всё, что держит порт: контейнер и возможные хостовые
# процессы от прошлых схем запуска. Иначе контейнер стартует, падает на
# EADDRINUSE и с restart: unless-stopped уходит в бесконечный цикл.
docker compose --env-file server/.env stop server 2>/dev/null || true
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

docker compose --env-file server/.env up -d server

echo "=== Waiting for API ==="
for i in $(seq 1 40); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "API is up"
    break
  fi
  if [ "$i" = "40" ]; then
    echo "ERROR: API did not come up."
    echo "--- container status ---"
    docker compose ps || true
    echo "--- container logs ---"
    docker compose logs --tail 50 server || true
    exit 1
  fi
  sleep 2
done

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

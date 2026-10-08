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
# Разовая чистка возможных хостовых процессов от прошлых схем запуска.
# Контейнер не трогаем: им управляет compose.
screen -X -S flex-server quit 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true

docker compose --env-file server/.env up -d server

echo "=== Waiting for API ==="
for i in $(seq 1 40); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "API is up"
    break
  fi
  if [ "$i" = "40" ]; then
    echo "ERROR: API did not come up."
    echo "--- who holds 3001 ---"
    sudo ss -tlnp | grep 3001 || true
    echo "--- container logs ---"
    docker compose logs --tail 50 server || true
    exit 1
  fi
  sleep 2
done

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

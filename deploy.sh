#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
# Секреты берутся из server/.env (в git не попадает) либо из переменных окружения.
set -e

cd /opt/flex

if [ -f /opt/flex/server/.env ]; then
  echo "=== Loading secrets from server/.env ==="
  set -a
  . /opt/flex/server/.env
  set +a
fi

if [ -z "$DATABASE_URL" ] || [ -z "$JWT_SECRET" ]; then
  echo "ERROR: DATABASE_URL and JWT_SECRET must be set."
  echo "Create /opt/flex/server/.env (see server/.env.example) or export them before running."
  exit 1
fi

echo "=== Pulling latest code ==="
git fetch origin && git reset --hard origin/main

echo "=== Building server ==="
cd /opt/flex/server
npm install --silent
npx prisma generate
npx prisma db push --accept-data-loss
npm run build

echo "=== Building client ==="
cd /opt/flex/client
npm install --silent
npm run build
sudo cp -r dist/* /var/www/html/

echo "=== Restarting server ==="
# The previous process may be a `tsx watch` dev process, so stop whatever holds
# the port rather than matching a command line.
sudo fuser -k 3001/tcp 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
screen -X -S flex-server quit 2>/dev/null || true
sleep 2

screen -dmS flex-server bash -c 'cd /opt/flex/server && exec node dist/index.js'

echo "=== Waiting for API ==="
for i in $(seq 1 20); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "API is up"
    break
  fi
  if [ "$i" = "20" ]; then
    echo "ERROR: API did not come up. Check: screen -r flex-server"
    exit 1
  fi
  sleep 1
done

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
# Секреты берутся из server/.env (в git не попадает) либо из переменных окружения.
set -e

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
git pull

echo "=== Building server ==="
cd /opt/flex/server
npm install
npx prisma generate
npx prisma db push --accept-data-loss
npm run build

echo "=== Building client ==="
cd /opt/flex/client
npm install
npm run build
sudo cp -r dist/* /var/www/html/

echo "=== Restarting server ==="
sudo pkill -f "node /opt/flex/server/dist" || true
nohup node /opt/flex/server/dist/index.js > /tmp/flex-server.log 2>&1 &

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

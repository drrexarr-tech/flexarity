#!/bin/bash
# Ручной деплой одной командой: bash deploy.sh
set -e

echo "=== Pulling latest code ==="
git pull

echo "=== Building server ==="
cd /opt/flex/server
npm install
npx prisma generate
DATABASE_URL="postgresql://flex:flex_password@localhost:5432/flexdb?schema=public" npx prisma db push --accept-data-loss
npm run build

echo "=== Building client ==="
cd /opt/flex/client
npm install
npm run build
sudo cp -r dist/* /var/www/html/

echo "=== Restarting server ==="
sudo pkill -f "node /opt/flex/server/dist" || true
DATABASE_URL="postgresql://flex:flex_password@localhost:5432/flexdb?schema=public" JWT_SECRET="fYDu9GXGplIHAjXPoK" nohup node /opt/flex/server/dist/index.js > /tmp/flex-server.log 2>&1 &

echo "=== Reloading nginx ==="
sudo systemctl reload nginx || sudo systemctl start nginx

echo "=== Deploy complete ==="

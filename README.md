# Flex - Сборник приложений

## Быстрый старт (локальная разработка)

1. Установите Node.js 20+ и PostgreSQL
2. Настройте `.env` в папке `server/`
3. Установите зависимости:

```bash
cd server && npm install
cd ../client && npm install
cd ..
```

4. Запустите миграцию БД:

```bash
cd server && npx prisma db push && npx tsx src/seed.ts
```

5. Запустите дев-серверы:

```bash
npm run dev
```

Клиент: http://localhost:5173
Сервер: http://localhost:3001

## Деплой на VPS (Ubuntu)

```bash
# Установите Docker и Docker Compose
sudo apt update && sudo apt install docker.io docker-compose -y

# Клонируйте проект
git clone <repo-url> /opt/flex
cd /opt/flex

# SSL сертификаты (Let's Encrypt)
sudo apt install certbot -y
sudo certbot certonly --standalone -d veheys.online
sudo cp /etc/letsencrypt/live/veheys.online/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/veheys.online/privkey.pem ssl/

# Соберите сервер
cd server && npm install && npx prisma generate && npm run build && cd ..

# Запустите
docker-compose up -d
```

## Electron (Windows Desktop)

```bash
cd electron
npm install
npm run build:win
```

# Flex

Персональный сборник приложений — рецепты, задачи, заметки, семейный доступ и чат. Работает как PWA (на телефоне) и как Electron-приложение (на Windows).

## Функции

### 🔐 Авторизация
- Регистрация и вход по email + пароль
- Вход через Telegram (Telegram Login Widget)
- Вход через VK ID
- JWT-токены, хранение в localStorage

### 📖 Рецепты
- Создание, редактирование, удаление рецептов
- Поля: название, описание, ссылка на оригинал, категория, время готовки, ингредиенты, инструкции
- Фильтрация по категории
- Видимость: только я / семья / публичный
- Двойной клик для открытия детального просмотра

### ✅ Задачи (Kanban + список)
- Доска с колонками (Kanban) + режим списка
- Drag-and-drop между колонками (dnd-kit)
- Drag-and-drop на пустую колонку (useDroppable)
- Поля: название, описание, приоритет (низкий/средний/высокий), срок, видимость
- **Исполнитель** — можно назначить участника семьи, по умолчанию ставится создатель
- Двойной клик для редактирования
- Видимость: только я / семья / публичный

### 📝 Заметки
- Создание, редактирование, удаление
- Текст + аудиозапись (base64 в БД)
- Сетка карточек

### 👨‍👩‍👧‍👦 Семья
- Создание семей
- Приглашение по email (с отправкой письма и уведомлением)
- Отмена ожидающих приглашений
- Принятие приглашения по ссылке с токеном
- Удаление участников (админ)
- Выход из семьи

### 💬 Чаты
- Приватные чаты между пользователями
- Поиск пользователей по имени/email
- Поиск внутри существующих чатов
- Текстовые сообщения
- **Голосовые сообщения** — запись через MediaRecorder (opus), проигрывание с прогресс-баром, видна длительность
- **Сквозное шифрование (E2EE)** — RSA-2048 + AES-256-GCM, ключи генерируются на клиенте через Web Crypto API, приватный ключ хранится в localStorage
- Отметка о прочтении (иконка CheckCheck + «Прочитано»)
- Удаление чата
- Автообновление сообщений (опрос каждые 5с)
- Переход к чату из уведомления (/chats/:chatId)

### 🔔 Уведомления
- Иконка-колокольчик в шапке с числом непрочитанных
- Выпадающий список уведомлений
- Отметить всё прочитанным
- Автообновление каждые 30с

### 👤 Профиль
- Редактирование имени и даты рождения
- Загрузка аватарки (через multer)
- Привязка Telegram ID и VK ID
- Смена темы (светлая/тёмная)

### 🎨 Интерфейс
- React + Vite + Tailwind CSS + shadcn/ui
- framer-motion анимации (PageTransition)
- Адаптивность: 360, 580, 760, 1280, 1920, 2440px
- PWA: установка на iPhone/Android, офлайн-регистрация Service Worker
- Тёмная и светлая темы
- Русский интерфейс
- Нижняя навигация на мобильных

### ☁️ Развёртывание
- VPS Ubuntu, nginx на 8080, сервер на :3001
- PostgreSQL в Docker
- Автодеплой через GitHub Actions (push в main → SSH → git reset → build → restart)
- Скрипт deploy.sh

## Стек

- **Фронтенд:** React 18, Vite 6, Tailwind CSS 4, shadcn/ui, framer-motion, dnd-kit, react-hook-form, zod, zustand
- **Бэкенд:** Express, Prisma ORM, PostgreSQL
- **Безопасность:** bcryptjs (пароли), JWT (аутентификация), Web Crypto API (E2EE чатов)
- **Деплой:** Docker, nginx, GitHub Actions

## Запуск

```bash
# Сервер
cd server
npm install
cp .env.example .env  # настроить DATABASE_URL, JWT_SECRET
npx prisma generate
npx prisma migrate dev
npm run dev

# Клиент
cd client
npm install
npm run dev
```

## Структура проекта

```
server/
  prisma/schema.prisma    — схемы БД
  src/routes/             — auth, recipes, tasks, family, chat, notes, notifications, upload
  src/middleware/          — auth (JWT), errorHandler
  src/lib/                — prisma client, email

client/
  src/pages/              — LoginPage, DashboardPage, RecipesPage, RecipeDetailPage, TasksPage, NotesPage, FamilyPage, ChatsPage, ProfilePage, InvitePage
  src/components/         — layout (AppLayout, Sidebar), recipes (RecipeForm), tasks (TaskForm, TaskCard, KanbanBoard, TaskListView)
  src/stores/             — authStore (zustand), themeStore
  src/lib/                — api (HTTP-клиент), crypto (Web Crypto E2EE), utils
  src/types/              — интерфейсы TypeScript
```

## Переменные окружения (.env)

### Сервер
- `DATABASE_URL` — подключение к PostgreSQL
- `JWT_SECRET` — секрет для JWT
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — для отправки писем (опционально)
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота (для OAuth)
- `VK_SERVICE_KEY`, `VK_PROTECTED_KEY` — ключи VK API

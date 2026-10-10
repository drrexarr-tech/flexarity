// Must be first: Express 4 drops promise rejections from async handlers, so
// every `throw new AppError(...)` in a route would become an unhandled
// rejection and hang the request instead of reaching errorHandler. This patch
// forwards them, and it only works when imported before the routers.
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth';
import { recipesRouter } from './routes/recipes';
import { tasksRouter } from './routes/tasks';
import { familyRouter } from './routes/family';
import { chatRouter } from './routes/chat';
import { notificationsRouter } from './routes/notifications';
import { notesRouter } from './routes/notes';
import { uploadRouter } from './routes/upload';
import { plansRouter } from './routes/plans';
import { wishesRouter } from './routes/wishes';
import { calendarRouter } from './routes/calendar';
import { shoppingRouter } from './routes/shopping';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * Refuse to start without a real signing key. Every sign/verify site used to
 * fall back to the literal 'secret', so a deployment that lost JWT_SECRET would
 * quietly become forgeable by anyone:
 * jwt.sign({ userId: '<victim uuid>' }, 'secret').
 */
const jwtSecret = (process.env.JWT_SECRET || '').trim();
if (!jwtSecret || jwtSecret === 'secret' || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET is missing or too weak; refusing to start');
}
if (jwtSecret.length < 32) {
  // Still usable, and rotating it signs everyone out, so warn rather than refuse.
  console.warn('JWT_SECRET is shorter than 32 characters; consider rotating it');
}

// nginx подставляет настоящий адрес клиента в X-Forwarded-For, и без доверия
// к прокси все пользователи попали бы в один счётчик лимитов. Значение 1 берёт
// последний элемент цепочки — тот, что записал nginx.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// The API returns JSON and serves user uploads; nothing here should be embeddable.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        sandbox: [],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  })
);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
// 50mb applied to every route, including unauthenticated login and OAuth, so a
// handful of concurrent large bodies exhausted the heap. Chat audio goes through
// multipart and carries its own 10mb multer limit.
app.use(express.json({ limit: '1mb' }));

const limiter = (windowMs: number, limit: number, name: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: `Слишком много запросов (${name}). Попробуйте позже.` },
  });

// Password and OAuth endpoints are the ones worth guessing at.
app.use('/api/auth/login', limiter(15 * 60 * 1000, 10, 'вход'));
app.use('/api/auth/register', limiter(60 * 60 * 1000, 5, 'регистрация'));
app.use('/api/auth/oauth', limiter(15 * 60 * 1000, 10, 'вход через сервис'));
app.use('/api/auth/link', limiter(15 * 60 * 1000, 10, 'привязка'));
// Each import is a server-side fetch to an attacker-chosen host: a rate limit
// here is what keeps the endpoint from being used as a DDoS proxy.
app.use('/api/recipes/import', limiter(60 * 60 * 1000, 20, 'импорт рецептов'));
app.use('/api/upload', limiter(60 * 60 * 1000, 60, 'загрузка файлов'));
app.use('/api/chat', limiter(60 * 1000, 120, 'сообщения'));
app.use('/api', limiter(60 * 1000, 600, 'общий лимит'));

app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/family', familyRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/plans', plansRouter);
app.use('/api/wishes', wishesRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/shopping', shoppingRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

/**
 * A fatal error leaves the process in an undefined state — requests hang while
 * the event loop is compromised. Exiting non-zero hands the restart to the
 * platform (Docker `restart: unless-stopped`); merely logging would leave the
 * API alive but broken with no way to notice.
 */
let shuttingDown = false;
function fatal(kind: string, err: unknown): void {
  console.error(`${kind}:`, err);
  if (shuttingDown) return;
  shuttingDown = true;
  // stdout to a pipe is async in Node, so give the log a moment to flush.
  setTimeout(() => process.exit(1), 250);
}

process.on('uncaughtException', (err) => fatal('Uncaught exception:', err));
process.on('unhandledRejection', (err) => fatal('Unhandled rejection:', err));

/**
 * PostgreSQL is a separate container, so it can still be starting up (or
 * briefly restarting) when this process comes up. Retrying here means the API
 * never listens before the database can serve it, without depending on a
 * Compose healthcheck — and it behaves the same whether it was launched by
 * Compose, by systemd or by hand.
 */
async function connectWithRetry(attempts = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await prisma.$connect();
      console.log('Connected to PostgreSQL');
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.error(
        `Database not ready (attempt ${attempt}/${attempts}), retrying in ${delayMs / 1000}s:`,
        (error as Error).message
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  try {
    await connectWithRetry();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

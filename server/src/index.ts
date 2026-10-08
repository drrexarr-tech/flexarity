import express from 'express';
import cors from 'cors';
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

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));

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

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

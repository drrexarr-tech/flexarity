import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth';
import { recipesRouter } from './routes/recipes';
import { tasksRouter } from './routes/tasks';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/tasks', tasksRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

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

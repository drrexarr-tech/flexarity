import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
  name: z.string().min(2, 'Минимум 2 символа'),
});

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(400, 'Пользователь с таким email уже существует');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });

  await prisma.taskColumn.createMany({
    data: [
      { title: 'Нужно сделать', color: '#3B82F6', order: 0, userId: user.id },
      { title: 'В процессе', color: '#F59E0B', order: 1, userId: user.id },
      { title: 'Готово', color: '#10B981', order: 2, userId: user.id },
    ],
  });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(400, 'Неверный email или пароль');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError(400, 'Неверный email или пароль');
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Требуется авторизация');
  }

  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }

  res.json(user);
});

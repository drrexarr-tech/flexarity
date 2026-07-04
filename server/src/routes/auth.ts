import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
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

const oauthSchema = z.object({
  provider: z.enum(['telegram', 'vk']),
  data: z.record(z.any()),
});

import crypto from 'crypto';

authRouter.post('/oauth', async (req: Request, res: Response) => {
  const { provider, data } = oauthSchema.parse(req.body);

  if (provider === 'telegram') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const checkHash = data.hash;
      const checkArr = Object.keys(data)
        .filter((k) => k !== 'hash')
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join('\n');
      const secretKey = crypto.createHash('sha256').update(botToken).digest();
      const hmac = crypto.createHmac('sha256', secretKey).update(checkArr).digest('hex');
      if (hmac !== checkHash) {
        throw new AppError(400, 'Недействительные данные Telegram');
      }
    }

    const telegramId = String(data.id);
    const name = data.first_name + (data.last_name ? ` ${data.last_name}` : '');
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      const email = data.email || `tg_${data.id}@telegram.placeholder`;
      user = await prisma.user.findUnique({ where: { email } });
    }
    if (!user) {
      user = await prisma.user.create({
        data: { email: `tg_${data.id}@telegram.placeholder`, password: '', name, telegramId },
      });
    } else if (!user.telegramId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { telegramId } });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }

  if (provider === 'vk') {
    const vkId = String(data.id);
    const email = data.email || `vk_${data.id}@vk.placeholder`;
    const name = data.first_name + (data.last_name ? ` ${data.last_name}` : '');
    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user) user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email, password: '', name, vkId } });
    } else if (!user.vkId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }

  throw new AppError(400, 'Неподдерживаемый провайдер');
});

// Link Telegram/VK to existing account
const linkSchema = z.object({
  provider: z.enum(['telegram', 'vk']),
  data: z.record(z.any()),
});

authRouter.post('/link', authenticate, async (req: AuthRequest, res: Response) => {
  const { provider, data } = linkSchema.parse(req.body);

  if (data.id === 'undefined' || data.id === 'null') {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { [provider === 'telegram' ? 'telegramId' : 'vkId']: null },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  if (data.remove) {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { [provider === 'telegram' ? 'telegramId' : 'vkId']: null },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  if (provider === 'telegram') {
    const telegramId = String(data.id);
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing && existing.id !== req.userId) {
      throw new AppError(400, 'Telegram уже привязан к другому аккаунту');
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { telegramId },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  if (provider === 'vk') {
    const vkId = String(data.id);
    const existing = await prisma.user.findUnique({ where: { vkId } });
    if (existing && existing.id !== req.userId) {
      throw new AppError(400, 'VK уже привязан к другому аккаунту');
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { vkId },
      select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
    });
    return res.json(user);
  }

  throw new AppError(400, 'Неподдерживаемый провайдер');
});

authRouter.put('/public-key', authenticate, async (req: AuthRequest, res: Response) => {
  const { publicKey } = z.object({ publicKey: z.string() }).parse(req.body);
  await prisma.user.update({
    where: { id: req.userId },
    data: { publicKey },
  });
  res.json({ message: 'OK' });
});

authRouter.get('/public-key/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = String(req.params.userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKey: true },
  });
  if (!user || !user.publicKey) throw new AppError(404, 'Пользователь не найден');
  res.json({ publicKey: user.publicKey });
});

// Update profile
const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

authRouter.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  const data = updateProfileSchema.parse(req.body);
  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.email) updateData.email = data.email;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
  });
  res.json(user);
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
    select: { id: true, email: true, name: true, telegramId: true, vkId: true, avatarUrl: true, dateOfBirth: true, publicKey: true },
  });

  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }

  res.json(user);
});

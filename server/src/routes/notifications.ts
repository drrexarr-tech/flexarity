import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

notificationsRouter.get('/unread-count', async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.userId, read: false },
  });
  res.json({ count });
});

notificationsRouter.put('/:id/read', async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.userId },
    data: { read: true },
  });
  res.json({ ok: true });
});

notificationsRouter.put('/read-all', async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

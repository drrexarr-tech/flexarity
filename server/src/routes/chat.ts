import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const chatRouter = Router();
chatRouter.use(authenticate);

const messageSchema = z.object({
  content: z.string().min(1),
  audio: z.string().optional(),
});

chatRouter.get('/', async (req: AuthRequest, res: Response) => {
  const participations = await prisma.chatParticipant.findMany({
    where: { userId: req.userId },
    include: {
      chat: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { chat: { updatedAt: 'desc' } },
  });

  res.json(participations.map((p) => p.chat));
});

chatRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { participantId } = z.object({ participantId: z.string() }).parse(req.body);

  const myChatIds = (
    await prisma.chatParticipant.findMany({
      where: { userId: req.userId },
      select: { chatId: true },
    })
  ).map((c) => c.chatId);

  const existing = await prisma.chatParticipant.findFirst({
    where: { chatId: { in: myChatIds }, userId: participantId },
    include: {
      chat: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });

  if (existing) {
    return res.json(existing.chat);
  }

  const chat = await prisma.chat.create({
    data: {
      participants: {
        create: [
          { userId: req.userId! },
          { userId: participantId },
        ],
      },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const targetUser = await prisma.user.findUnique({ where: { id: participantId } });
  const me = await prisma.user.findUnique({ where: { id: req.userId } });

  await prisma.notification.create({
    data: {
      type: 'chat_invite',
      title: `Новый чат`,
      message: `${me?.name} начал(а) с вами чат`,
      link: `/chats/${chat.id}`,
      userId: participantId,
    },
  });

  res.status(201).json(chat);
});

chatRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);

  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId: req.userId },
  });
  if (!participant) return res.status(403).json({ error: 'Вы не участник чата' });

  const participantCount = await prisma.chatParticipant.count({ where: { chatId } });

  await prisma.chatParticipant.deleteMany({
    where: { chatId, userId: req.userId },
  });

  if (participantCount <= 1) {
    await prisma.message.deleteMany({ where: { chatId } });
    await prisma.chat.delete({ where: { id: chatId } });
  }

  res.json({ message: 'Чат удалён' });
});

chatRouter.get('/search/participants', async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || '');
  if (q.length < 2) return res.json([]);

  const myChatIds = (
    await prisma.chatParticipant.findMany({
      where: { userId: req.userId },
      select: { chatId: true },
    })
  ).map((c) => c.chatId);

  const participants = await prisma.chatParticipant.findMany({
    where: {
      chatId: { in: myChatIds },
      userId: { not: req.userId },
      user: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      chat: { select: { id: true } },
    },
    take: 20,
  });

  res.json(participants.map((p) => ({ ...p.user, chatId: p.chat.id })));
});

chatRouter.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } } },
    take: 100,
  });
  res.json(messages);
});

chatRouter.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);
  const { content, audio } = messageSchema.parse(req.body);

  const message = await prisma.message.create({
    data: { content, audio, chatId, userId: req.userId! },
    include: { user: { select: { id: true, name: true } } },
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const participants = await prisma.chatParticipant.findMany({
    where: { chatId, userId: { not: req.userId } },
    include: { user: { select: { id: true } } },
  });

  const me = await prisma.user.findUnique({ where: { id: req.userId } });

  for (const p of participants) {
    await prisma.notification.create({
      data: {
        type: 'message',
        title: `Новое сообщение от ${me?.name}`,
        message: content.slice(0, 100),
        link: `/chats/${chatId}`,
        userId: p.userId,
      },
    });
  }

  res.status(201).json(message);
});

chatRouter.get('/search/users', async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || '');
  if (q.length < 2) return res.json([]);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
      NOT: { id: req.userId },
    },
    select: { id: true, name: true, email: true },
    take: 10,
  });

  res.json(users);
});

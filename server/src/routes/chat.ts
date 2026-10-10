import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalText, optionalNumber } from '../lib/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const chatRouter = Router();
chatRouter.use(authenticate);

const messageSchema = z.object({
  content: z.string().min(1),
  audio: optionalText(),
  audioDuration: optionalNumber(),
  image: optionalText(),
});

const createChatSchema = z.object({
  participantId: z.string(),
  encryptedKeys: z.record(z.string()).optional(),
});

chatRouter.get('/', async (req: AuthRequest, res: Response) => {
  let participations;
  try {
    participations = await prisma.chatParticipant.findMany({
      where: { userId: req.userId },
      include: {
        chat: {
          include: {
            participants: {
              include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
            },
            keys: {
              where: { userId: req.userId },
              select: { key: true },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
            _count: {
              select: { messages: { where: { userId: { not: req.userId }, readAt: null } } },
            },
          },
        },
      },
      orderBy: { chat: { updatedAt: 'desc' } },
    });
  } catch {
    participations = await prisma.chatParticipant.findMany({
      where: { userId: req.userId },
      include: {
        chat: {
          include: {
            participants: {
              include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
            _count: {
              select: { messages: { where: { userId: { not: req.userId }, readAt: null } } },
            },
          },
        },
      },
      orderBy: { chat: { updatedAt: 'desc' } },
    });
  }

  res.json(participations.map((p) => ({ ...p.chat, unreadCount: p.chat._count.messages })));
});

chatRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { participantId, encryptedKeys } = createChatSchema.parse(req.body);

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
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          },
          keys: {
            where: { userId: req.userId },
            select: { key: true },
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
      // z.record validates the values but accepts any key, so key rows were being
      // written for users who are not in this conversation. Only the two
      // participants of a brand new chat may receive one.
      ...(encryptedKeys ? {
        keys: {
          create: Object.entries(encryptedKeys)
            .filter(([userId]) => userId === req.userId || userId === participantId)
            .map(([userId, key]) => ({ userId, key })),
        },
      } : {}),
    },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      keys: {
        where: { userId: req.userId },
        select: { key: true },
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

  await prisma.chatKey.deleteMany({ where: { chatId, userId: req.userId } });
  await prisma.chatParticipant.deleteMany({
    where: { chatId, userId: req.userId },
  });

  const remaining = await prisma.chatParticipant.count({ where: { chatId } });
  if (remaining === 0) {
    await prisma.message.deleteMany({ where: { chatId } });
    await prisma.chat.delete({ where: { id: chatId } });
  }

  res.json({ message: 'Вы вышли из чата' });
});

chatRouter.delete('/:id/delete', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);

  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId: req.userId },
  });
  if (!participant) return res.status(403).json({ error: 'Вы не участник чата' });

  await prisma.message.deleteMany({ where: { chatId } });
  await prisma.chatKey.deleteMany({ where: { chatId } });
  await prisma.chatParticipant.deleteMany({ where: { chatId } });
  await prisma.chat.delete({ where: { id: chatId } });

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

/**
 * Membership check for anything scoped to a chat. Without it, any authenticated
 * user holding a chat id could read the history, post into it, and overwrite the
 * E2E key rows of people who are not even in the conversation.
 */
async function requireParticipant(userId: string, chatId: string): Promise<void> {
  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId },
    select: { userId: true },
  });
  if (!participant) throw new AppError(403, 'Вы не участник чата');
}

chatRouter.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);
  await requireParticipant(req.userId!, chatId);

  await prisma.message.updateMany({
    where: { chatId, userId: { not: req.userId }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    take: 100,
  });
  res.json(messages);
});

chatRouter.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);
  await requireParticipant(req.userId!, chatId);

  const { content, audio, audioDuration, image } = messageSchema.parse(req.body);

  const message = await prisma.message.create({
    data: { content, audio, audioDuration, image, chatId, userId: req.userId! },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  // Re-add any participant who left (has messages but no ChatParticipant row)
  const participants = await prisma.chatParticipant.findMany({
    where: { chatId },
    select: { userId: true },
  });
  const existingIds = participants.map((p) => p.userId);

  const allMessageUsers = await prisma.message.findMany({
    where: { chatId, userId: { not: req.userId } },
    distinct: ['userId'],
    select: { userId: true },
  });

  const me = await prisma.user.findUnique({ where: { id: req.userId } });

  for (const mu of allMessageUsers) {
    if (!existingIds.includes(mu.userId)) {
      await prisma.chatParticipant.create({ data: { chatId, userId: mu.userId } });
    }
    await prisma.notification.create({
      data: {
        type: 'message',
        title: `Новое сообщение от ${me?.name}`,
        message: content.slice(0, 100),
        link: `/chats/${chatId}`,
        userId: mu.userId,
      },
    });
  }

  res.status(201).json(message);
});

chatRouter.delete('/:chatId/messages/:messageId', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.chatId);
  const messageId = String(req.params.messageId);

  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId, userId: req.userId },
  });
  if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

  await prisma.message.delete({ where: { id: messageId } });
  res.json({ message: 'Сообщение удалено' });
});

chatRouter.put('/:id/encrypt', async (req: AuthRequest, res: Response) => {
  const chatId = String(req.params.id);
  const { encryptedKeys } = z.object({
    encryptedKeys: z.record(z.string()),
  }).parse(req.body);

  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId: req.userId },
  });
  if (!participant) return res.status(403).json({ error: 'Вы не участник чата' });

  // Keys may only be written for actual members. z.record accepts any key, so
  // without this a member could overwrite the key material of users who are not
  // in the chat and corrupt what they will later fetch.
  const members = await prisma.chatParticipant.findMany({
    where: { chatId },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));
  const foreign = Object.keys(encryptedKeys).filter((id) => !memberIds.has(id));
  if (foreign.length) {
    throw new AppError(400, 'Ключи можно сохранить только для участников чата');
  }

  for (const [userId, key] of Object.entries(encryptedKeys)) {
    await prisma.chatKey.upsert({
      where: { chatId_userId: { chatId, userId } },
      create: { chatId, userId, key },
      update: { key },
    });
  }

  const updated = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      keys: {
        where: { userId: req.userId },
        select: { key: true },
      },
    },
  });

  res.json(updated);
});

chatRouter.get('/search/users', async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || '').trim();
  // Two characters is short enough to walk the whole user table one chunk at a
  // time. Three, plus a rate limit, turns enumeration into a crawl.
  if (q.length < 3) return res.json([]);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
      NOT: { id: req.userId },
    },
    // email is deliberately absent. Matching on it is what makes "find someone
    // to talk to" work, but returning it handed every registered address to any
    // authenticated caller, for phishing or credential stuffing. The chat UI only
    // ever rendered the name and the avatar.
    select: { id: true, name: true, avatarUrl: true },
    take: 10,
  });

  res.json(users);
});

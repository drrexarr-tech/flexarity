import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const wishesRouter = Router();
wishesRouter.use(authenticate);

const wishlistSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

const itemSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  price: z.coerce.number().min(0, 'Цена не может быть отрицательной').optional(),
  url: z.string().optional(),
  note: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  recipientId: z.string().optional(),
});

const userSelect = { select: { id: true, name: true } } as const;

async function familyIdsOf(userId: string) {
  const families = await prisma.familyMember.findMany({
    where: { userId },
    select: { familyId: true },
  });
  return families.map((f) => f.familyId);
}

async function findVisible(id: string, userId: string) {
  const list = await prisma.wishlist.findUnique({ where: { id } });
  if (!list) throw new AppError(404, 'Список не найден');

  if (list.userId === userId) return list;
  if (list.visibility === 'public') return list;
  if (list.visibility === 'family' && list.familyId) {
    const familyIds = await familyIdsOf(userId);
    if (familyIds.includes(list.familyId)) return list;
  }
  throw new AppError(403, 'Нет доступа');
}

/** Users the current user can pick as a gift recipient: themselves + family members. */
wishesRouter.get('/recipients', async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.familyMember.findMany({
    where: { userId: req.userId! },
    select: { family: { select: { members: { select: { user: userSelect } } } } },
  });

  const byId = new Map<string, { id: string; name: string }>();
  for (const m of memberships) {
    for (const member of m.family.members) byId.set(member.user.id, member.user);
  }

  const me = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, name: true },
  });
  if (me) byId.set(me.id, me);

  res.json([...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
});

wishesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);

  const lists = await prisma.wishlist.findMany({
    where: {
      OR: [
        { userId: req.userId! },
        { visibility: 'family', familyId: { in: familyIds } },
        { visibility: 'public' },
      ],
    },
    include: {
      user: userSelect,
      items: { select: { price: true, bought: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    lists.map(({ items, ...rest }) => {
      const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
      const bought = items.filter((i) => i.bought).length;
      return {
        ...rest,
        canEdit: rest.userId === req.userId,
        itemCount: items.length,
        boughtCount: bought,
        totalPrice: total,
        unboughtTotal: items.filter((i) => !i.bought).reduce((s, i) => s + (i.price ?? 0), 0),
      };
    })
  );
});

wishesRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const list = await findVisible(String(req.params.id), req.userId!);

  const full = await prisma.wishlist.findUnique({
    where: { id: list.id },
    include: {
      user: userSelect,
      items: {
        include: { owner: userSelect, recipient: userSelect },
        orderBy: [{ bought: 'asc' }, { createdAt: 'desc' }],
      },
    },
  });
  if (!full) throw new AppError(404, 'Список не найден');

  const { items, ...rest } = full;
  const totalPrice = items.reduce((s, i) => s + (i.price ?? 0), 0);

  res.json({
    ...rest,
    canEdit: list.userId === req.userId,
    items,
    itemCount: items.length,
    boughtCount: items.filter((i) => i.bought).length,
    totalPrice,
    unboughtTotal: items.filter((i) => !i.bought).reduce((s, i) => s + (i.price ?? 0), 0),
  });
});

wishesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = wishlistSchema.parse(req.body);
  const list = await prisma.wishlist.create({
    data: {
      title: data.title,
      description: data.description || null,
      visibility: data.visibility,
      familyId: data.visibility === 'family' ? data.familyId || null : null,
      userId: req.userId!,
    },
    include: { user: userSelect, items: { select: { price: true, bought: true } } },
  });

  const { items, ...rest } = list;
  res.status(201).json({ ...rest, canEdit: true, itemCount: 0, boughtCount: 0, totalPrice: 0, unboughtTotal: 0 });
});

wishesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.wishlist.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Список не найден');

  const data = wishlistSchema.partial().parse(req.body);
  const list = await prisma.wishlist.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.familyId !== undefined || data.visibility !== undefined
        ? { familyId: data.visibility === 'family' ? data.familyId || null : null }
        : {}),
    },
    include: { user: userSelect, items: { select: { price: true, bought: true } } },
  });

  const { items, ...rest } = list;
  res.json({
    ...rest,
    canEdit: true,
    itemCount: items.length,
    boughtCount: items.filter((i) => i.bought).length,
    totalPrice: items.reduce((s, i) => s + (i.price ?? 0), 0),
    unboughtTotal: items.filter((i) => !i.bought).reduce((s, i) => s + (i.price ?? 0), 0),
  });
});

wishesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.wishlist.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Список не найден');

  await prisma.wishlist.delete({ where: { id: existing.id } });
  res.json({ message: 'Список удалён' });
});

wishesRouter.post('/:id/items', async (req: AuthRequest, res: Response) => {
  const list = await findVisible(String(req.params.id), req.userId!);
  const data = itemSchema.parse(req.body);

  const item = await prisma.wishItem.create({
    data: {
      title: data.title,
      price: data.price === undefined ? null : Math.round(data.price),
      url: data.url || null,
      note: data.note || null,
      priority: data.priority ?? null,
      recipientId: data.recipientId || null,
      wishlistId: list.id,
      ownerId: req.userId!,
    },
    include: { owner: userSelect, recipient: userSelect },
  });
  res.status(201).json(item);
});

wishesRouter.put('/:id/items/:itemId', async (req: AuthRequest, res: Response) => {
  const list = await findVisible(String(req.params.id), req.userId!);
  const existing = await prisma.wishItem.findFirst({
    where: { id: String(req.params.itemId), wishlistId: list.id },
  });
  if (!existing) throw new AppError(404, 'Подарок не найден');

  // Marking as bought is intentionally allowed for anyone who can see the list —
  // that is what makes a shared wishlist usable for gift planning.
  if (req.body.bought !== undefined && Object.keys(req.body).length === 1) {
    const bought = Boolean(req.body.bought);
    const item = await prisma.wishItem.update({
      where: { id: existing.id },
      data: { bought, boughtAt: bought ? new Date() : null },
      include: { owner: userSelect, recipient: userSelect },
    });
    return res.json(item);
  }

  if (existing.ownerId !== req.userId) throw new AppError(403, 'Нет доступа');

  const data = itemSchema.partial().parse(req.body);
  const item = await prisma.wishItem.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.price !== undefined ? { price: data.price === null ? null : Math.round(data.price) } : {}),
      ...(data.url !== undefined ? { url: data.url || null } : {}),
      ...(data.note !== undefined ? { note: data.note || null } : {}),
      ...(data.priority !== undefined ? { priority: data.priority ?? null } : {}),
      ...(data.recipientId !== undefined ? { recipientId: data.recipientId || null } : {}),
    },
    include: { owner: userSelect, recipient: userSelect },
  });
  res.json(item);
});

wishesRouter.delete('/:id/items/:itemId', async (req: AuthRequest, res: Response) => {
  const list = await findVisible(String(req.params.id), req.userId!);
  const existing = await prisma.wishItem.findFirst({
    where: { id: String(req.params.itemId), wishlistId: list.id },
  });
  if (!existing) throw new AppError(404, 'Подарок не найден');
  if (existing.ownerId !== req.userId) throw new AppError(403, 'Нет доступа');

  await prisma.wishItem.delete({ where: { id: existing.id } });
  res.json({ message: 'Подарок удалён' });
});

import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const shoppingRouter = Router();
shoppingRouter.use(authenticate);

const itemSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  quantity: z.coerce.number().positive('Количество должно быть больше нуля').optional(),
  unit: z.string().optional(),
  price: z.coerce.number().min(0, 'Цена не может быть отрицательной').optional(),
  category: z.string().optional(),
  familyId: z.string().optional(),
});

const userSelect = { select: { id: true, name: true } } as const;

async function familyIdsOf(userId: string) {
  const families = await prisma.familyMember.findMany({
    where: { userId },
    select: { familyId: true },
  });
  return families.map((f) => f.familyId);
}

/** The list is shared: you see your own items plus anything shared with your families. */
async function findVisible(id: string, userId: string, familyIds: string[]) {
  const item = await prisma.shoppingItem.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'Товар не найден');
  if (item.userId === userId) return item;
  if (item.familyId && familyIds.includes(item.familyId)) return item;
  throw new AppError(403, 'Нет доступа');
}

shoppingRouter.get('/', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);

  const items = await prisma.shoppingItem.findMany({
    where: {
      OR: [{ userId: req.userId! }, { familyId: { in: familyIds } }],
    },
    include: { user: userSelect, buyer: userSelect },
    orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(items);
});

shoppingRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = itemSchema.parse(req.body);
  const familyIds = await familyIdsOf(req.userId!);

  // Guard against sharing into a family the caller is not a member of.
  const familyId = data.familyId && familyIds.includes(data.familyId) ? data.familyId : null;

  const item = await prisma.shoppingItem.create({
    data: {
      title: data.title,
      quantity: data.quantity ?? null,
      unit: data.unit || null,
      price: data.price === undefined ? null : Math.round(data.price),
      category: data.category || null,
      familyId,
      userId: req.userId!,
    },
    include: { user: userSelect, buyer: userSelect },
  });
  res.status(201).json(item);
});

shoppingRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);
  const existing = await findVisible(String(req.params.id), req.userId!, familyIds);

  // Ticking an item off records who took care of it.
  if (req.body.done !== undefined && Object.keys(req.body).length === 1) {
    const done = Boolean(req.body.done);
    const item = await prisma.shoppingItem.update({
      where: { id: existing.id },
      data: { done, doneAt: done ? new Date() : null, buyerId: done ? req.userId! : null },
      include: { user: userSelect, buyer: userSelect },
    });
    return res.json(item);
  }

  const data = itemSchema.partial().parse(req.body);
  const item = await prisma.shoppingItem.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.quantity !== undefined ? { quantity: data.quantity ?? null } : {}),
      ...(data.unit !== undefined ? { unit: data.unit || null } : {}),
      ...(data.price !== undefined ? { price: data.price === null ? null : Math.round(data.price) } : {}),
      ...(data.category !== undefined ? { category: data.category || null } : {}),
    },
    include: { user: userSelect, buyer: userSelect },
  });
  res.json(item);
});

shoppingRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);
  const existing = await findVisible(String(req.params.id), req.userId!, familyIds);

  await prisma.shoppingItem.delete({ where: { id: existing.id } });
  res.json({ message: 'Товар удалён' });
});

/** Bulk cleanup: forget everything already ticked off. */
shoppingRouter.post('/clear-done', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);
  const { count } = await prisma.shoppingItem.deleteMany({
    where: {
      done: true,
      OR: [{ userId: req.userId! }, { familyId: { in: familyIds } }],
    },
  });
  res.json({ removed: count });
});

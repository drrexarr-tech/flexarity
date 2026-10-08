import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const plansRouter = Router();
plansRouter.use(authenticate);

const planSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  targetAmount: z.coerce.number().min(0, 'Сумма не может быть отрицательной').default(0),
  deadline: z.string().optional(),
  color: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

const entrySchema = z.object({
  amount: z.coerce.number().int('Сумма должна быть целым числом').positive('Сумма должна быть больше нуля'),
  type: z.enum(['income', 'expense']).default('income'),
  note: z.string().optional(),
  date: z.string().optional(),
});

type EntryShape = { amount: number; type: string };

const userSelect = { select: { id: true, name: true } } as const;

function withTotals<T extends { entries: EntryShape[]; targetAmount: number }>(plan: T) {
  let income = 0;
  let expense = 0;
  for (const e of plan.entries) {
    if (e.type === 'expense') expense += e.amount;
    else income += e.amount;
  }
  const saved = income - expense;
  const target = plan.targetAmount;
  const percent = target > 0 ? Math.max(0, Math.min(100, Math.round((saved / target) * 100))) : 0;
  const { entries, ...rest } = plan;
  return { ...rest, saved, income, expense, percent, remaining: Math.max(target - saved, 0) };
}

async function familyIdsOf(userId: string) {
  const families = await prisma.familyMember.findMany({
    where: { userId },
    select: { familyId: true },
  });
  return families.map((f) => f.familyId);
}

/** Loads a plan the user is allowed to see, or throws 404/403. */
async function findVisible(id: string, userId: string) {
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new AppError(404, 'План не найден');

  if (plan.userId === userId) return plan;
  if (plan.visibility === 'public') return plan;
  if (plan.visibility === 'family' && plan.familyId) {
    const familyIds = await familyIdsOf(userId);
    if (familyIds.includes(plan.familyId)) return plan;
  }
  throw new AppError(403, 'Нет доступа');
}

plansRouter.get('/', async (req: AuthRequest, res: Response) => {
  const familyIds = await familyIdsOf(req.userId!);

  const plans = await prisma.plan.findMany({
    where: {
      OR: [
        { userId: req.userId },
        { visibility: 'family', familyId: { in: familyIds } },
        { visibility: 'public' },
      ],
    },
    include: { user: userSelect, entries: { select: { amount: true, type: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(plans.map(withTotals));
});

plansRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const plan = await findVisible(String(req.params.id), req.userId!);

  const full = await prisma.plan.findUnique({
    where: { id: plan.id },
    include: {
      user: userSelect,
      entries: {
        include: { user: userSelect },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
  if (!full) throw new AppError(404, 'План не найден');

  res.json({ ...withTotals(full), canEdit: plan.userId === req.userId });
});

plansRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = planSchema.parse(req.body);
  const plan = await prisma.plan.create({
    data: {
      title: data.title,
      description: data.description || null,
      targetAmount: Math.round(data.targetAmount),
      deadline: data.deadline ? new Date(data.deadline) : null,
      color: data.color || null,
      visibility: data.visibility,
      familyId: data.visibility === 'family' ? data.familyId || null : null,
      userId: req.userId!,
    },
    include: { user: userSelect, entries: { select: { amount: true, type: true } } },
  });
  res.status(201).json(withTotals(plan));
});

plansRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.plan.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'План не найден');

  const data = planSchema.partial().parse(req.body);
  const plan = await prisma.plan.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.targetAmount !== undefined ? { targetAmount: Math.round(data.targetAmount) } : {}),
      ...(data.deadline !== undefined
        ? { deadline: data.deadline ? new Date(data.deadline) : null }
        : {}),
      ...(data.color !== undefined ? { color: data.color || null } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.familyId !== undefined || data.visibility !== undefined
        ? { familyId: data.visibility === 'family' ? data.familyId || null : null }
        : {}),
    },
    include: { user: userSelect, entries: { select: { amount: true, type: true } } },
  });
  res.json(withTotals(plan));
});

plansRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.plan.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'План не найден');

  await prisma.plan.delete({ where: { id: existing.id } });
  res.json({ message: 'План удалён' });
});

plansRouter.post('/:id/entries', async (req: AuthRequest, res: Response) => {
  const plan = await findVisible(String(req.params.id), req.userId!);
  const data = entrySchema.parse(req.body);

  const entry = await prisma.planEntry.create({
    data: {
      amount: Math.round(data.amount),
      type: data.type,
      note: data.note || null,
      date: data.date ? new Date(data.date) : new Date(),
      planId: plan.id,
      userId: req.userId!,
    },
    include: { user: userSelect },
  });
  res.status(201).json(entry);
});

plansRouter.delete('/:id/entries/:entryId', async (req: AuthRequest, res: Response) => {
  const entry = await prisma.planEntry.findFirst({
    where: { id: String(req.params.entryId), planId: String(req.params.id) },
  });
  if (!entry) throw new AppError(404, 'Запись не найдена');
  if (entry.userId !== req.userId) throw new AppError(403, 'Нет доступа');

  await prisma.planEntry.delete({ where: { id: entry.id } });
  res.json({ message: 'Запись удалена' });
});

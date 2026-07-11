import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

const columnSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  color: z.string().optional(),
  order: z.number().optional(),
});

const taskSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional(),
  order: z.number().optional(),
  columnId: z.string(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
  assigneeId: z.string().optional(),
});

// Columns
tasksRouter.get('/columns', async (req: AuthRequest, res: Response) => {
  const families = await prisma.familyMember.findMany({
    where: { userId: req.userId },
    select: { familyId: true },
  });
  const familyIds = families.map((f) => f.familyId);

  const columns = await prisma.taskColumn.findMany({
    where: { userId: req.userId },
    include: {
      tasks: {
        where: {
          OR: [
            { userId: req.userId },
            { assigneeId: req.userId },
            { visibility: 'family', familyId: { in: familyIds } },
            { visibility: 'public' },
          ],
        },
        orderBy: { order: 'asc' },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { order: 'asc' },
  });

  const myColumnIds = columns.map((c) => c.id);

  const assignedTasks = await prisma.task.findMany({
    where: {
      assigneeId: req.userId,
      userId: { not: req.userId },
      columnId: { notIn: myColumnIds },
    },
    orderBy: { order: 'asc' },
    include: {
      column: true,
      assignee: { select: { id: true, name: true, email: true } },
      user: { select: { id: true, name: true } },
    },
  });

  res.json({ columns, assignedTasks });
});

tasksRouter.post('/columns', async (req: AuthRequest, res: Response) => {
  const data = columnSchema.parse(req.body);
  const column = await prisma.taskColumn.create({
    data: { ...data, userId: req.userId! },
  });
  res.status(201).json(column);
});

tasksRouter.put('/columns/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.taskColumn.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Колонка не найдена');

  const data = columnSchema.partial().parse(req.body);
  const column = await prisma.taskColumn.update({
    where: { id: String(req.params.id) },
    data,
  });
  res.json(column);
});

tasksRouter.delete('/columns/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.taskColumn.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Колонка не найдена');

  await prisma.taskColumn.delete({ where: { id: String(req.params.id) } });
  res.json({ message: 'Колонка удалена' });
});

// Reorder
tasksRouter.put('/reorder/all', async (req: AuthRequest, res: Response) => {
  const { items } = z.object({
    items: z.array(z.object({
      id: z.string(),
      order: z.number(),
      columnId: z.string(),
    })),
  }).parse(req.body);

  for (const item of items) {
    await prisma.task.update({
      where: { id: item.id },
      data: { order: item.order, columnId: item.columnId },
    });
  }

  res.json({ message: 'Порядок обновлён' });
});

// Tasks
tasksRouter.get('/', async (req: AuthRequest, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId },
    orderBy: { order: 'asc' },
    include: { column: true, assignee: { select: { id: true, name: true, email: true } } },
  });
  res.json(tasks);
});

tasksRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = taskSchema.parse(req.body);
  const task = await prisma.task.create({
    data: { ...data, userId: req.userId!, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(task);
});

tasksRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.task.findFirst({
    where: {
      id: String(req.params.id),
      OR: [
        { userId: req.userId },
        { assigneeId: req.userId },
      ],
    },
  });
  if (!existing) throw new AppError(404, 'Задача не найдена');

  const data = taskSchema.partial().parse(req.body);
  const task = await prisma.task.update({
    where: { id: String(req.params.id) },
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
  res.json(task);
});

tasksRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.task.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Задача не найдена');

  await prisma.task.delete({ where: { id: String(req.params.id) } });
  res.json({ message: 'Задача удалена' });
});

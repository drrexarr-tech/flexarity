import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalText } from '../lib/validation';
import { familyIdsOf, resolveFamilyId } from '../lib/access';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

/**
 * A due date has three states and they must not collapse into two.
 * optionalText() already distinguishes them: absent means "leave unchanged",
 * null or "" means "clear it". Writing `data.dueDate ? new Date(...) : undefined`
 * threw the null away and turned every clear into a no-op, so unchecking the
 * due date appeared to work and then reappeared on reload - Prisma reads
 * undefined as "do not touch this field".
 */
function parseDueDate(value: string | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

const columnSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  color: optionalText(),
  order: z.number().optional(),
});

const taskSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: optionalText(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: optionalText(),
  order: z.number().optional(),
  columnId: z.string(),
  visibility: z.preprocess((v) => (v === 'public' ? 'private' : v), z.enum(['private', 'family']).default('private')),
  familyId: optionalText(),
  assigneeId: optionalText(),
});

/**
 * A task may only land in a column the caller owns. columnId was a bare
 * z.string(), so any authenticated user could create or move a task onto
 * somebody else's board, where it then renders in their column list.
 */
async function assertOwnColumn(userId: string, columnId: string): Promise<void> {
  const column = await prisma.taskColumn.findFirst({
    where: { id: columnId, userId },
    select: { id: true },
  });
  if (!column) throw new AppError(403, 'Колонка не принадлежит вам');
}

/** Assignees are limited to people the user shares a family with, or themselves. */
async function assertShareable(userId: string, assigneeId: string | null | undefined): Promise<void> {
  if (!assigneeId || assigneeId === userId) return;
  const target = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
  if (!target) throw new AppError(400, 'Исполнитель не найден');

  const shared = await prisma.familyMember.findFirst({
    where: {
      familyId: { in: await familyIdsOf(userId) },
      userId: assigneeId,
    },
    select: { id: true },
  });
  if (!shared) throw new AppError(403, 'Исполнитель должен быть членом семьи');
}

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

    // A task published to a family sits in the owner's column, and the query
    // above only reads the caller's own columns, so the visibility filter that
    // used to sit inside include.tasks could never match anything: the form
    // offered "Семья" and the family was never shown the task. Fetched the same
    // way as assignedTasks, as a read-only group beside the board.
    const familyTasks = await prisma.task.findMany({
      where: {
        visibility: 'family',
        familyId: { in: familyIds },
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

    res.json({ columns, assignedTasks, familyTasks });
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

  // Every other :id route here resolves the task against the caller first. This
  // one only validated shape, so any authenticated user could reorder or
  // relocate any task in the system by id. Skip what is not theirs rather than
  // failing the whole batch, so a stale drag does not break the board.
  const myColumns = await prisma.taskColumn.findMany({
    where: { userId: req.userId },
    select: { id: true },
  });
  const myColumnIds = new Set(myColumns.map((c) => c.id));

  for (const item of items.slice(0, 200)) {
    // Checking only the task still let a user move their own task onto someone
    // else's board, which then rendered there.
    if (!myColumnIds.has(item.columnId)) continue;

    // Ownership, not assignment. An assignee is shown someone else's task in
    // "Назначено мне" and could use this to relocate it out of the owner's
    // board, where it then stopped rendering for them at all. DELETE is
    // owner-only too, so this matches it.
    const owned = await prisma.task.findFirst({
      where: { id: item.id, userId: req.userId },
      select: { id: true },
    });
    if (!owned) continue;

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
  await assertOwnColumn(req.userId!, data.columnId);
  await assertShareable(req.userId!, data.assigneeId);

  const task = await prisma.task.create({
    data: {
      ...data,
      familyId: await resolveFamilyId(req.userId!, data.familyId),
      userId: req.userId!,
      dueDate: parseDueDate(data.dueDate),
    },
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
    // An assignee is a recipient of the task, not its author. The card renders
    // no edit control for them, but the route still matched on assigneeId and
    // accepted the whole payload, so anyone a task was delegated to could
    // rewrite its title, description, priority and deadline. Silently dropping
    // those fields left a "200 OK" on a write that never happened; refusing is
    // what the UI already implies.
    const isOwner = existing.userId === req.userId;
    if (!isOwner) throw new AppError(403, 'Редактировать задачу может только автор');
    if (data.columnId) await assertOwnColumn(req.userId!, data.columnId);
    if (data.assigneeId !== undefined) await assertShareable(req.userId!, data.assigneeId);

  const patch: Record<string, unknown> = { ...data };
  if (data.familyId !== undefined) {
    patch.familyId = await resolveFamilyId(req.userId!, data.familyId);
  }

  const task = await prisma.task.update({
    where: { id: String(req.params.id) },
    data: { ...patch, dueDate: parseDueDate(data.dueDate) } as any,
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
  res.json(task);
});

tasksRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.task.findFirst({ where: { id: String(req.params.id) } });
  // Answer 403 rather than 404 when the task is there but belongs to someone
  // else. A 404 read as "задача не найдена" sent the user hunting for a row
  // that was simply not theirs to remove, and every delete of a task created in
  // a shared column produced it.
  if (!existing) throw new AppError(404, 'Задача не найдена');
  if (existing.userId !== req.userId) {
    throw new AppError(403, 'Эту задачу создали не вы — удалить её нельзя');
  }

  await prisma.task.delete({ where: { id: String(req.params.id) } });
  res.json({ message: 'Задача удалена' });
});

import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendPush } from '../lib/push';
import { optionalText } from '../lib/validation';
import { familyIdsOf, resolveFamilyId } from '../lib/access';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

  /**
   * What counts as the finished column.
   *
   * A column carries no kind, only a title, and the board this ships with
   * names its last column "Готово". Matching that and the handful of words a
   * person would actually type is the difference between the assignee being told
   * the task is done and nothing happening at all.
   */
  const DONE_TITLE = /^(готово|done|выполнено|завершено|завершена)/i;

  function isDoneColumn(title: string | null | undefined): boolean {
    return !!title && DONE_TITLE.test(title.trim());
  }

  /** The owner's finished column, when they have one. */
  async function findDoneColumn(userId: string) {
    const columns = await prisma.taskColumn.findMany({
      where: { userId },
      select: { id: true, title: true },
    });
    return columns.find((c) => isDoneColumn(c.title)) || null;
  }

  /**
   * Tell the author that a task was finished.
   *
   * Being handed a task is one half of the loop; without this the author had
   * no way of learning it had been done unless they went and looked at the
   * board themselves.
   */
  async function notifyTaskDone(taskId: string, movedBy: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, userId: true, assignee: { select: { name: true } } },
    });
    if (!task || task.userId === movedBy) return;

    const name = task.assignee?.name || 'Исполнитель';
    const message = `«${task.title}» — выполнил ${name}`;

    await prisma.notification.create({
      data: {
        type: 'task_done',
        title: 'Задача готова',
        message,
        data: JSON.stringify({ taskId: task.id }),
        link: '/tasks',
        userId: task.userId,
      },
    });

    void sendPush(task.userId, {
      title: 'Задача готова',
      body: message,
      link: '/tasks',
      tag: `task-done-${task.id}`,
    });
  }

/**
 * A due date has three states and they must not collapse into two.
 * optionalText() already distinguishes them: absent means "leave unchanged",
 * null or "" means "clear it". Writing `data.dueDate ? new Date(...) : undefined`
 * threw the null away and turned every clear into a no-op, so unchecking the
 * due date appeared to work and then reappeared on reload - Prisma reads
 * undefined as "do not touch this field".
 */
function formatDueDate(value: Date): string {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = value.getDate();
  const month = months[value.getMonth()];
  const today = new Date();
  const sameDay = today.toDateString() === value.toDateString();
  if (sameDay) return 'сегодня';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (tomorrow.toDateString() === value.toDateString()) return 'завтра';
  return `${day} ${month}`;
}

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

    // Whether the assignee has anywhere to put a finished task. The board is
    // the author's, so the caller cannot see their columns and would otherwise
    // be offered a button that fails.
    const assignerBoards = new Map<string, string | null>();
    for (const authorId of new Set(assignedTasks.map((t) => t.userId))) {
      if (!assignerBoards.has(authorId)) {
        assignerBoards.set(authorId, (await findDoneColumn(authorId))?.id ?? null);
      }
    }
    const decoratedAssigned = assignedTasks.map((task) => ({
      ...task,
      doneColumnId: assignerBoards.get(task.userId) ?? null,
      alreadyDone: isDoneColumn(task.column?.title),
    }));

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

    res.json({ columns, assignedTasks: decoratedAssigned, familyTasks });
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
    for (const item of items.slice(0, 200)) {
      const target = await prisma.task.findFirst({
        where: { id: item.id },
        select: { id: true, userId: true, assigneeId: true, columnId: true },
      });
      if (!target) continue;

      const owns = target.userId === req.userId;
      const delegated = !owns && target.assigneeId === req.userId;
      if (!owns && !delegated) continue;

      // The board a task may be dropped on is the one it lives on: the author's
      // for their own task, and the author's for a task delegated to the caller.
      // An assignee shown the task in "Назначено мне" could otherwise use this
      // to relocate it off a board that is not theirs.
      let allowed: { id: string; title: string }[];
      if (owns) {
        allowed = await prisma.taskColumn.findMany({
          where: { userId: req.userId },
          select: { id: true, title: true },
        });
      } else {
        allowed = await prisma.taskColumn.findMany({
          where: { userId: target.userId },
          select: { id: true, title: true },
        });
      }
      const destination = allowed.find((c) => c.id === item.columnId);
      if (!destination) continue;

      await prisma.task.update({
        where: { id: item.id },
        data: { order: item.order, columnId: item.columnId },
      });

      // Landing in the finished column, by somebody other than the author, is
      // the moment the author wants to hear about.
      if (delegated && item.columnId !== target.columnId && isDoneColumn(destination.title)) {
        void notifyTaskDone(item.id, req.userId!);
      }
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

  // Being handed a task is the one event the recipient did not cause, so it is
  // the one they cannot notice by looking at the app later. Until now it
  // appeared nowhere outside the board.
  if (data.assigneeId && data.assigneeId !== req.userId) {
    const owner = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { name: true },
    });
    const who = owner?.name || 'Кто-то';
    const due = task.dueDate ? formatDueDate(task.dueDate) : '';

    await prisma.notification.create({
      data: {
        type: 'task_assigned',
        title: `Вам поставили задачу от ${who}`,
        message: due ? `${task.title} · срок ${due}` : task.title,
        data: JSON.stringify({ taskId: task.id, columnId: task.columnId }),
        link: '/tasks',
        userId: data.assigneeId,
      },
    });

    void sendPush(data.assigneeId, {
      title: `Вам поставили задачу от ${who}`,
      body: due ? `${task.title} · срок ${due}` : task.title,
      link: '/tasks',
      tag: `task-assigned-${task.id}`,
    });
  }

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
    // An assignee works the task, they do not author it. Letting them rewrite
    // the title, description, priority and deadline was how anyone a task was
    // delegated to could take it over; letting them do nothing at all was how
    // they could never report it finished. So: position is theirs, content is
    // the author's.
    const isOwner = existing.userId === req.userId;
    if (!isOwner) {
      if (existing.assigneeId !== req.userId) {
        throw new AppError(403, 'Редактировать задачу может только автор');
      }
      const forbidden = Object.keys(data).filter(
        (key) => key !== 'columnId' && key !== 'order',
      );
      if (forbidden.length > 0) {
        throw new AppError(403, 'Исполнитель может только перемещать задачу');
      }
      if (data.columnId) {
        // The target must be a column of the author's board, not the mover's:
        // that was the hole the earlier version opened.
        const ownerColumn = await prisma.taskColumn.findFirst({
          where: { id: data.columnId, userId: existing.userId },
          select: { id: true, title: true },
        });
        if (!ownerColumn) throw new AppError(403, 'Нельзя переместить задачу на чужую доску');
      }
    } else {
      if (data.columnId) await assertOwnColumn(req.userId!, data.columnId);
      if (data.assigneeId !== undefined) await assertShareable(req.userId!, data.assigneeId);
    }

  const patch: Record<string, unknown> = { ...data };
  if (data.familyId !== undefined) {
    patch.familyId = await resolveFamilyId(req.userId!, data.familyId);
  }

const task = await prisma.task.update({
      where: { id: String(req.params.id) },
      data: { ...patch, dueDate: parseDueDate(data.dueDate) } as any,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    // Landing in the finished column is the signal, and only when somebody else
    // moved it: an author tidying their own board is not news to them.
    if (!isOwner && data.columnId) {
      const target = await prisma.taskColumn.findFirst({
        where: { id: data.columnId, userId: existing.userId },
        select: { title: true },
      });
      const wasDone = existing.columnId === data.columnId;
      if (isDoneColumn(target?.title) && !wasDone) {
        void notifyTaskDone(task.id, req.userId!);
      }
    }

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

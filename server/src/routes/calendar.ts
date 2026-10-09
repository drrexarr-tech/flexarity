import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { optionalText } from '../lib/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const calendarRouter = Router();
calendarRouter.use(authenticate);

const eventSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: optionalText(),
  date: z.string().min(1, 'Дата обязательна'),
  time: optionalText(),
  color: optionalText(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: optionalText(),
});

const userSelect = { select: { id: true, name: true } } as const;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

/**
 * The next yearly occurrence of a birthday that falls inside [from, to].
 * Returns null when the range is longer than a year (not supported) or there is none.
 */
function birthdayInRange(dob: Date, from: Date, to: Date): Date | null {
  const start = startOfDay(from);
  const end = endOfDay(to);

  const cand = new Date(start);
  cand.setMonth(dob.getMonth());
  cand.setDate(dob.getDate());

  if (cand.getTime() < start.getTime()) {
    cand.setFullYear(cand.getFullYear() + 1);
  }
  if (cand.getTime() > end.getTime()) return null;
  return cand;
}

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

/** People whose birthdays matter to this user: themselves + everyone in their families. */
async function contactsWithBirthdays(userId: string) {
  const memberships = await prisma.familyMember.findMany({
    where: { userId },
    select: { family: { select: { members: { select: { user: { select: { id: true, name: true, dateOfBirth: true } } } } } } },
  });

  const byId = new Map<string, { id: string; name: string; dateOfBirth: Date | null }>();
  for (const m of memberships) {
    for (const member of m.family.members) {
      byId.set(member.user.id, member.user);
    }
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, dateOfBirth: true },
  });
  if (me) byId.set(me.id, me);

  return [...byId.values()].filter((u) => u.dateOfBirth);
}

async function familyIdsOf(userId: string) {
  const families = await prisma.familyMember.findMany({
    where: { userId },
    select: { familyId: true },
  });
  return families.map((f) => f.familyId);
}

function visibilityFilter(userId: string, familyIds: string[]) {
  return {
    OR: [
      { userId },
      { visibility: 'family', familyId: { in: familyIds } },
      { visibility: 'public' },
    ],
  };
}

/** Events in [from, to] plus birthday occurrences in the same window. */
calendarRouter.get('/events', async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const from = startOfDay(parseDate(req.query.from, now));
  const to = endOfDay(parseDate(req.query.to, new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const familyIds = await familyIdsOf(req.userId!);

  const [events, people] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { ...visibilityFilter(req.userId!, familyIds), date: { gte: from, lte: to } },
      include: { user: userSelect },
      orderBy: { date: 'asc' },
    }),
    contactsWithBirthdays(req.userId!),
  ]);

  const birthdays = people
    .map((p) => {
      const when = birthdayInRange(p.dateOfBirth!, from, to);
      if (!when) return null;
      return {
        id: p.id,
        name: p.name,
        date: when.toISOString(),
        age: when.getFullYear() - p.dateOfBirth!.getFullYear(),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ events, birthdays });
});

/** Merged chronological list of upcoming events and birthdays. */
calendarRouter.get('/upcoming', async (req: AuthRequest, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(new Date(now.getTime() + days * 86400000));

  const familyIds = await familyIdsOf(req.userId!);

  const [events, people] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { ...visibilityFilter(req.userId!, familyIds), date: { gte: from, lte: to } },
      include: { user: userSelect },
      orderBy: { date: 'asc' },
    }),
    contactsWithBirthdays(req.userId!),
  ]);

  const items = [
    ...events.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date.toISOString(),
      time: e.time,
      color: e.color,
      daysLeft: daysBetween(e.date, now),
    })),
    ...people
      .map((p) => {
        const when = birthdayInRange(p.dateOfBirth!, from, to);
        if (!when) return null;
        return {
          kind: 'birthday' as const,
          id: p.id,
          title: `День рождения: ${p.name}`,
          description: null,
          date: when.toISOString(),
          time: null,
          color: null,
          age: when.getFullYear() - p.dateOfBirth!.getFullYear(),
          daysLeft: daysBetween(when, now),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null),
  ].sort((a, b) => a.date.localeCompare(b.date));

  res.json(items);
});

calendarRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = eventSchema.parse(req.body);
  const event = await prisma.calendarEvent.create({
    data: {
      title: data.title,
      description: data.description || null,
      date: startOfDay(new Date(data.date)),
      time: data.time || null,
      color: data.color || null,
      visibility: data.visibility,
      familyId: data.visibility === 'family' ? data.familyId || null : null,
      userId: req.userId!,
    },
    include: { user: userSelect },
  });
  res.status(201).json(event);
});

calendarRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Событие не найдено');

  const data = eventSchema.partial().parse(req.body);
  const event = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.date !== undefined ? { date: startOfDay(new Date(data.date)) } : {}),
      ...(data.time !== undefined ? { time: data.time || null } : {}),
      ...(data.color !== undefined ? { color: data.color || null } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.familyId !== undefined || data.visibility !== undefined
        ? { familyId: data.visibility === 'family' ? data.familyId || null : null }
        : {}),
    },
    include: { user: userSelect },
  });
  res.json(event);
});

calendarRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (!existing) throw new AppError(404, 'Событие не найдено');

  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  res.json({ message: 'Событие удалено' });
});

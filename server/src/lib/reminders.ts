import { prisma } from './prisma';
import { sendPush } from './push';

/**
 * Reminders that arrive without anybody asking for them.
 *
 * The first version swept every ten minutes and pushed whatever was on "today",
 * so a 19:46 event produced a notification at 19:50 - after it had happened -
 * and the title came out as "Сегодня, (19:46)" because the slicing was off by
 * one and left a bracket behind. Both are the same mistake: the sweep was
 * deciding *when* to speak instead of the event deciding *when* to be
 * mentioned.
 *
 * The rule now: an event is mentioned a fixed lead time before it starts, and
 * never after it has started. Nothing waits for a tick.
 */

const SWEEP_INTERVAL_MS = 60 * 1000;
const LEAD_MINUTES = 15;
/** An event with no time set is mentioned once in the morning instead. */
const MORNING_HOUR = 9;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * When the event actually begins.
 *
 * `date` is stored at midnight and `time` is a separate "HH:MM" string, so the
 * two have to be combined in the server's own timezone - the same one the
 * calendar page draws in.
 */
function eventStart(date: Date, time: string | null): Date {
  const start = startOfDay(date);
  if (!time) return start;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return start;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return start;
  start.setHours(hours, minutes, 0, 0);
  return start;
}

/** "19:46", and an empty string when the event has no time. */
function formatTime(time: string | null): string {
  if (!time) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return '';
  const hours = Number(match[1]);
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** 1 событие, 2 события, 5 событий. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

type DueEvent = {
  id: string;
  title: string;
  time: string | null;
  userId: string;
  date: Date;
};

/**
 * What to say, for one person with a handful of events coming up.
 *
 * Split out so the wording can be asserted directly: the title is what is seen
 * first on a lock screen, and it is the part that was wrong.
 */
export function composeReminder(list: DueEvent[]): { title: string; body: string } {
  if (list.length === 0) return { title: '', body: '' };

  if (list.length === 1) {
    const only = list[0];
    const time = formatTime(only.time);
    return {
      title: time ? `Сегодня в ${time}` : 'Сегодня',
      body: only.title,
    };
  }

  const times = list.map((e) => formatTime(e.time));
  const allTimed = times.every((t) => t !== '');
  const body = list
    .map((event, i) => (allTimed ? `${times[i]} · ${event.title}` : event.title))
    .join('\n');

  return {
    title: `Сегодня: ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}`,
    body,
  };
}

/**
 * Which events are due.
 *
 * `recovering` is set on the first sweep after a restart: a deploy that was down
 * across the lead window should not silently swallow the reminder, so anything
 * that has not started yet is still worth mentioning.
 */
export function selectDue(events: DueEvent[], now: Date, recovering: boolean): DueEvent[] {
  const lead = LEAD_MINUTES * 60 * 1000;
  const morning = startOfDay(now);
  morning.setHours(MORNING_HOUR, 0, 0, 0);

  return events.filter((event) => {
    // An event with no time spans the day. Its stored date is midnight, so the
    // "already started" test below would discard it every morning - which is
    // exactly when it is meant to be mentioned.
    if (!event.time) return now >= morning;

    const starts = eventStart(new Date(event.date), event.time);
    if (now >= starts) return false; // already begun, or past: saying nothing
    const remindAt = new Date(starts.getTime() - lead);
    if (now >= remindAt) return true;
    return recovering;
  });
}

async function sweep(recovering = false) {
  const now = new Date();
  const start = startOfDay(now);
  const end = new Date(start.getTime() + 86400000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      date: { gte: start, lt: end },
      remindedAt: null,
    },
    select: { id: true, title: true, time: true, userId: true, date: true },
    orderBy: { date: 'asc' },
  });

  if (events.length === 0) return 0;

  const byUser = new Map<string, DueEvent[]>();
  for (const event of events) {
    const list = byUser.get(event.userId) || [];
    list.push({
      id: event.id,
      title: event.title,
      time: event.time,
      userId: event.userId,
      date: new Date(event.date),
    });
    byUser.set(event.userId, list);
  }

  let sent = 0;
  for (const [userId, list] of byUser) {
    const due = selectDue(list, now, recovering);
    if (due.length === 0) continue;

    const { title, body } = composeReminder(due);

    await prisma.notification.create({
      data: {
        type: 'calendar_reminder',
        title,
        message: body,
        data: JSON.stringify({ eventIds: due.map((e) => e.id) }),
        link: '/calendar',
        userId,
      },
    });

    void sendPush(userId, {
      title,
      body,
      link: '/calendar',
      // One per event set, so a repeated sweep replaces rather than stacks.
      tag: `calendar-${due.map((e) => e.id).join('-')}`,
    });

    await prisma.calendarEvent.updateMany({
      where: { id: { in: due.map((e) => e.id) }, remindedAt: null },
      data: { remindedAt: new Date() },
    });
    sent++;
  }

  if (sent > 0) console.log(`[REMINDERS] ${sent} reminder(s) sent`);
  return sent;
}

export function startReminderSweeps() {
  // Once at boot, to catch whatever the restart may have swallowed, then every
  // minute so the lead time is accurate rather than rounded to a tick.
  const kickoff = setTimeout(() => void sweep(true), 15_000);
  const timer = setInterval(() => void sweep(false), SWEEP_INTERVAL_MS);

  return () => {
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}

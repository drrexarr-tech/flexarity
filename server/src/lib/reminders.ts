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
 * When the event actually begins, as an instant.
 *
 * `date` is stored at UTC midnight and `time` is a bare "HH:MM" written on the
 * user's own clock, so the two are put back together in that user's zone and
 * then shifted to UTC. An event entered as 19:46 in Moscow is 16:46 UTC; taking
 * the wall clock at face value would remind three hours late. Events saved
 * before this field existed have no offset and fall back to the server's clock,
 * which is what they always used.
 */
function eventStart(date: Date, time: string | null, tzOffset: number | null): Date {
  // The date parts are read in UTC because that is how the column is written:
  // UTC midnight. Reading them in local time silently shifts the event by a day
  // for half the planet.
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();

  if (!time) return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0) - (tzOffset ?? 0) * 60_000);
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0) - (tzOffset ?? 0) * 60_000);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0) - (tzOffset ?? 0) * 60_000);
  }

  return new Date(Date.UTC(y, mo, d, hours, minutes, 0, 0) - (tzOffset ?? 0) * 60_000);
}

/** The calendar day it belongs to on the user's own clock. */
function localDayKey(date: Date, tzOffset: number | null): string {
  const shifted = new Date(date.getTime() + (tzOffset ?? 0) * 60_000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth() + 1}-${shifted.getUTCDate()}`;
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
  tzOffset: number | null;
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

  return events.filter((event) => {
    // An event with no time spans the user's whole day. Its stored date is
    // midnight, so the "already started" test below would discard it every
    // morning - exactly when it is meant to be mentioned.
    if (!event.time) {
      const morning = new Date(eventStart(event.date, '00:00', event.tzOffset).getTime() + MORNING_HOUR * 3600_000);
      return now >= morning && localDayKey(now, event.tzOffset) === localDayKey(event.date, event.tzOffset);
    }

    const starts = eventStart(event.date, event.time, event.tzOffset);
    if (now >= starts) return false; // already begun, or past: saying nothing
    const remindAt = new Date(starts.getTime() - lead);
    if (now >= remindAt) return true;
    return recovering;
  });
}

async function sweep(recovering = false) {
  const now = new Date();

  // A wide window rather than "today" in the server's zone: an event can belong
  // to tomorrow for someone in Tokyo while it is still today here.
  const from = startOfDay(new Date(now.getTime() - 86400_000));
  const to = startOfDay(new Date(now.getTime() + 2 * 86400_000));

  const events = await prisma.calendarEvent.findMany({
    where: {
      date: { gte: from, lt: to },
      remindedAt: null,
    },
    select: { id: true, title: true, time: true, userId: true, date: true, tzOffset: true },
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
      tzOffset: event.tzOffset ?? null,
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
  /**
   * The guard is load-bearing, not decoration. `void sweep()` does not catch a
   * rejection: in Node an unhandled rejection ends the process, so a single bad
   * row would have taken the whole API down and `restart: unless-stopped` would
   * have brought it straight back, once a minute, as a stream of reset
   * connections. A reminder that fails is worth a log line and nothing more.
   */
  const run = (recovering: boolean) => {
    void sweep(recovering).catch((err) => {
      console.error('[REMINDERS] sweep failed:', err);
    });
  };

  const kickoff = setTimeout(() => run(true), 15_000);
  const timer = setInterval(() => run(false), SWEEP_INTERVAL_MS);

  return () => {
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}

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
/**
 * Three reminders, each with its own words.
 *
 * A single flag could only remember that a reminder had gone out, which meant
 * the day-before text was the only one that ever arrived: at an hour out the
 * event was already "reminded about" and stayed silent. Three stages, each
 * marked separately, is what makes 24 hours, an hour and five minutes all
 * possible without repeating any of them.
 */
const STAGES = [
  { lead: 24 * 60 * 60 * 1000, stage: 1, title: 'Завтра', leadText: 'начнётся завтра' },
  { lead: 60 * 60 * 1000, stage: 2, title: 'Через час', leadText: 'начнётся через час' },
  { lead: 5 * 60 * 1000, stage: 3, title: 'Через 5 минут', leadText: 'начнётся через 5 минут' },
] as const;
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
  reminderStage: number;
};

/**
 * What to say, at a given stage.
 *
 * Split out so the wording can be asserted directly: the title is what is seen
 * first on a lock screen, and it is the part that was wrong.
 */
export function composeReminder(
  list: DueEvent[],
  stage: number,
): { title: string; body: string } {
  if (list.length === 0) return { title: '', body: '' };
  const config = STAGES.find((s) => s.stage === stage) ?? STAGES[0];

  if (list.length === 1) {
    const only = list[0];
    const time = formatTime(only.time);
    if (stage === 3) {
      return { title: `${only.title} — ${time || 'скоро'}`, body: 'Пора начинаться' };
    }
    return {
      title: `${config.title}${time ? `, ${time}` : ''}`,
      body: only.title,
    };
  }

  const times = list.map((e) => formatTime(e.time));
  const allTimed = times.every((t) => t !== '');
  const body = list
    .map((event, i) => (allTimed ? `${times[i]} · ${event.title}` : event.title))
    .join('\n');

  if (stage === 3) {
    return { title: `Через 5 минут: ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}`, body };
  }

  return {
    title: `${config.title}: ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}`,
    body,
  };
}

/**
 * Which stage, if any, an event is due for.
 *
 * Stages move forwards only: an event that already had its day-before text
 * waits for the hour-before one, and so on. Returns null when nothing is due,
 * and never when the event has already started - a reminder after the fact is
 * worse than silence.
 *
 * `recovering` is set on the first sweep after a restart: a deploy that was down
 * across a window should not silently swallow that reminder, so the latest
 * stage already past is sent then and only then.
 */
export function stageFor(
  event: DueEvent,
  now: Date,
  recovering: boolean,
): number | null {
  // An event with no time spans the user's whole day, so there is no "before" to
  // count down to. Its stored date is midnight, which would otherwise make it
  // look long past.
  if (!event.time) {
    const localDay = localDayKey(event.date, event.tzOffset);
    if (localDayKey(now, event.tzOffset) !== localDay) return null;
    const morning = new Date(
      eventStart(event.date, '00:00', event.tzOffset).getTime() + MORNING_HOUR * 3600_000,
    );
    if (now < morning) return null;
    // Without this the morning reminder came back every hour until the day
    // rolled over, because there is only one stage to reach.
    if (event.reminderStage >= 1) return null;
    return 1;
  }

  const starts = eventStart(event.date, event.time, event.tzOffset);
  if (now >= starts) return null;

  const passed = STAGES.filter((s) => now.getTime() >= starts.getTime() - s.lead);
  if (passed.length === 0) return null;

  const next = passed[passed.length - 1];
  if (next.stage <= event.reminderStage) {
    return recovering ? next.stage : null;
  }
  return next.stage;
}

export function selectDue(
  events: DueEvent[],
  now: Date,
  recovering: boolean,
): { event: DueEvent; stage: number }[] {
  const out: { event: DueEvent; stage: number }[] = [];
  for (const event of events) {
    const stage = stageFor(event, now, recovering);
    if (stage !== null) out.push({ event, stage });
  }
  return out;
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
      // Stage 0 means nothing has gone out yet. Events already at the last stage
      // are read every minute for no reason, so they are left out.
      reminderStage: { lt: STAGES.length },
    },
    select: {
      id: true, title: true, time: true, userId: true,
      date: true, tzOffset: true, reminderStage: true,
    },
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
      reminderStage: event.reminderStage,
    });
    byUser.set(event.userId, list);
  }

  let sent = 0;
  for (const [userId, list] of byUser) {
    const due = selectDue(list, now, recovering);
    if (due.length === 0) continue;

    // One message per stage: two events due at different stages must not be
    // folded into one sentence that belongs to neither.
    for (const stage of STAGES) {
      const group = due.filter((d) => d.stage === stage.stage);
      if (group.length === 0) continue;

      const { title, body } = composeReminder(
        group.map((g) => g.event),
        stage.stage,
      );

      await prisma.notification.create({
        data: {
          type: 'calendar_reminder',
          title,
          message: body,
          data: JSON.stringify({ eventIds: group.map((g) => g.event.id), stage: stage.stage }),
          link: '/calendar',
          userId,
        },
      });

      void sendPush(userId, {
        title,
        body,
        link: '/calendar',
        // Per stage, so the hour-before text replaces the day-before one rather
        // than landing under it.
        tag: `calendar-${stage.stage}-${group.map((g) => g.event.id).join('-')}`,
      });

      sent++;
    }

    await prisma.calendarEvent.updateMany({
      where: { id: { in: due.map((d) => d.event.id) } },
      data: { reminderStage: STAGES.length },
    });
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

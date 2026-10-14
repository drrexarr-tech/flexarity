import { prisma } from './prisma';
import { sendPush } from './push';

/**
 * The reminders that arrive without anybody asking for them.
 *
 * Two kinds, both of which used to need the user to be looking at the app:
 *  - a task was put on you, which is not something you caused;
 *  - something is on today, which is the one thing a daily summary is for.
 *
 * The sweep runs inside the API process rather than from a scheduler: a family
 * app has one server and no queue, and an interval needs no new moving parts.
 */

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function localDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * "Today" is the server's day. Events are stored as a date with an optional
 * time string, so the window has to follow that shape rather than UTC.
 */
function formatTime(time: string | null): string {
  if (!time) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time.trim();
  const hours = Number(match[1]);
  const minutes = match[2];
  if (hours >= 5 && hours < 12) return `${hours}:${minutes}`;
  return `${hours}:${minutes}`;
}

/**
 * One digest per person for the day, rather than one notification per event:
 * three events today is one thing to read, not three.
 */
async function sweepTodayReminders() {
  const { start, end } = localDayBounds();

  const events = await prisma.calendarEvent.findMany({
    where: {
      date: { gte: start, lt: end },
      remindedAt: null,
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { date: 'asc' },
  });

  if (events.length === 0) return;

  const byUser = new Map<string, typeof events>();
  for (const event of events) {
    const list = byUser.get(event.userId) || [];
    list.push(event);
    byUser.set(event.userId, list);
  }

  for (const [userId, list] of byUser) {
    const first = list[0];
    const times = list.map((e) => formatTime(e.time)).filter(Boolean);
    const when = times.length > 0 ? ` (${times.join(', ')})` : '';
    const headline = list.length === 1 ? first.title : `${list.length} события сегодня`;

    await prisma.notification.create({
      data: {
        type: 'calendar_reminder',
        title: 'Сегодня',
        message: list.length === 1 ? `${first.title}${when}` : `${list.map((e) => e.title).join(', ')}${when}`,
        data: JSON.stringify({ eventIds: list.map((e) => e.id) }),
        link: '/calendar',
        userId,
      },
    });

    void sendPush(userId, {
      title: `Сегодня${when ? `, ${when.slice(1, -1)}` : ''}`,
      body: list.length === 1 ? first.title : `${list.length} события: ${list.map((e) => e.title).join(', ')}`,
      link: '/calendar',
      // One per day, so a second sweep cannot stack a duplicate on top.
      tag: `calendar-today-${start.toISOString().slice(0, 10)}`,
    });

    // Marked after the row is written, so a crash mid-send retries rather than
    // dropping the reminder.
    await prisma.calendarEvent.updateMany({
      where: { id: { in: list.map((e) => e.id) }, remindedAt: null },
      data: { remindedAt: new Date() },
    });
  }

  console.log(`[REMINDERS] today digest for ${byUser.size} user(s)`);
}

export function startReminderSweeps() {
  const run = async () => {
    try {
      await sweepTodayReminders();
    } catch (err) {
      console.error('[REMINDERS] sweep failed:', err);
    }
  };

  // Staggered first run: on a fresh boot nobody wants a burst of reminders
  // before the database has settled.
  const kickoff = setTimeout(run, 20_000);
  const timer = setInterval(run, SWEEP_INTERVAL_MS);

  return () => {
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}
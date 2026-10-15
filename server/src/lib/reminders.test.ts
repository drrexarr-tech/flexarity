import { describe, it, expect } from 'vitest';
import { composeReminder, selectDue, stageFor } from './reminders';

// The wording is what a lock screen shows first, and "Сегодня, (19:46)" came
// out of this code on a real phone. The timing is the other half: an event at
// 19:46 produced a notification at 19:50, after it had happened.
const DAY = new Date(Date.UTC(2026, 5, 15));
const utc = (h: number, m: number) => new Date(Date.UTC(2026, 5, 15, h, m));
/** The day before, which is where the 24-hour reminder lives. */
const utcPrev = (h: number, m: number) => new Date(Date.UTC(2026, 5, 14, h, m));

// The fixture event is 2026-06-15 19:46 UTC, so its windows open at
// 06-14 19:46 (a day ahead), 06-15 18:46 (an hour) and 06-15 19:41 (five minutes).

const event = (
  time: string | null,
  opts: { tzOffset?: number | null; stage?: number; date?: Date } = {},
) => ({
  id: 'e',
  title: 'Встреча',
  time,
  userId: 'u',
  date: opts.date ?? DAY,
  tzOffset: opts.tzOffset === undefined ? 0 : opts.tzOffset,
  reminderStage: opts.stage ?? 0,
});

describe('reminder wording, per stage', () => {
  it('says tomorrow a day ahead', () => {
    expect(composeReminder([event('19:46')], 1)).toEqual({
      title: 'Завтра, 19:46',
      body: 'Встреча',
    });
  });

  it('says an hour ahead differently', () => {
    expect(composeReminder([event('19:46')], 2)).toEqual({
      title: 'Через час, 19:46',
      body: 'Встреча',
    });
  });

  it('puts the five-minute one the other way round, name first', () => {
    const five = composeReminder([event('19:46')], 3);
    expect(five.title).toBe('Встреча — 19:46');
    expect(five.body).toBe('Пора начинаться');
  });

  it('never leaves a bracket in a title', () => {
    for (const stage of [1, 2, 3]) {
      for (const time of ['00:05', '9:05', '19:46', '23:59']) {
        expect(composeReminder([event(time)], stage).title).not.toMatch(/[()[\]]/);
      }
    }
  });

  it('counts several events in Russian', () => {
    const many = [event('10:00'), event('11:00'), event('12:00'), event('13:00'), event('14:00')];
    expect(composeReminder(many, 1).title).toBe('Завтра: 5 событий');
    expect(composeReminder([event('10:00'), event('11:00')], 2).title).toBe('Через час: 2 события');
    expect(composeReminder(many, 3).title).toBe('Через 5 минут: 5 событий');
    expect(composeReminder(Array.from({ length: 11 }, () => event('10:00')), 1).title).toBe(
      'Завтра: 11 событий',
    );
  });

  it('pairs times with titles only when every event has one', () => {
    expect(composeReminder([event('10:00'), event('18:30')], 1).body).toContain('10:00 · Встреча');
    const mixed = composeReminder([event(null), event('18:30')], 1).body;
    expect(mixed).not.toMatch(/\d{2}:\d{2} · /);
  });

  it('says nothing about nothing', () => {
    expect(composeReminder([], 1)).toEqual({ title: '', body: '' });
  });
});

describe('which stage is due', () => {
  it('is silent a day before', () => {
    expect(stageFor(event('19:46'), utcPrev(18, 46), false)).toBeNull();
    expect(stageFor(event('19:46'), utcPrev(19, 45), false)).toBeNull();
  });

  it('fires the day-before text 24 hours out', () => {
    expect(stageFor(event('19:46'), utcPrev(19, 46), false)).toBe(1);
    expect(stageFor(event('19:46'), utcPrev(20, 0), false)).toBe(1);
  });

  it('moves on to the hour before', () => {
    expect(stageFor(event('19:46'), utc(18, 46), false)).toBe(2);
  });

  it('moves on to five minutes before', () => {
    expect(stageFor(event('19:46'), utc(19, 41), false)).toBe(3);
  });

  it('says nothing once the event has started', () => {
    expect(stageFor(event('19:46'), utc(19, 46), false)).toBeNull();
    expect(stageFor(event('19:46'), utc(23, 59), false)).toBeNull();
  });

  it('never repeats a stage that already went out', () => {
    // The whole point of a stage counter: the day-before text used to be the
    // only reminder that ever arrived, because it marked the event as done.
    expect(stageFor(event('19:46', { stage: 1 }), utc(18, 46), false)).toBe(2);
    expect(stageFor(event('19:46', { stage: 2 }), utc(19, 41), false)).toBe(3);
    expect(stageFor(event('19:46', { stage: 3 }), utc(19, 41), false)).toBeNull();
  });

  it('skips straight to the latest stage when several have passed', () => {
    // A server that was down across the day-before window should send the
    // nearest one, not the stale one.
    expect(stageFor(event('19:46'), utc(19, 41), false)).toBe(3);
  });

  it('sends a missed reminder only on recovery', () => {
    // Already had the hour-before text; the five-minute window has not opened.
    expect(stageFor(event('19:46', { stage: 2 }), utc(19, 30), false)).toBeNull();
    expect(stageFor(event('19:46', { stage: 2 }), utc(19, 30), true)).toBe(2);
    // Recovery still refuses to announce an event that has already begun.
    expect(stageFor(event('19:46', { stage: 1 }), utc(19, 50), true)).toBeNull();
  });

  it('mentions an all-day event in the morning, once', () => {
    expect(stageFor(event(null), utc(8, 59), false)).toBeNull();
    expect(stageFor(event(null), utc(9, 0), false)).toBe(1);
    expect(stageFor(event(null, { stage: 1 }), utc(11, 0), false)).toBeNull();
  });

  it('ignores a malformed time rather than crashing', () => {
    // It falls back to midnight, which has already passed, so it stays silent
    // rather than announcing something at a time nobody wrote.
    expect(stageFor(event('не время'), utc(23, 59), false)).toBeNull();
    expect(stageFor(event('25:99'), utc(23, 59), false)).toBeNull();
    expect(() => stageFor(event('не время'), utc(1, 0), false)).not.toThrow();
  });
});

describe("the user's own clock, not the server's", () => {
  // 19:46 entered in Moscow is 16:46 UTC. Taking the wall clock at face value
  // would remind three hours late - the bug right after "arrived too late".
  const moscow = 180;

  it('fires a Moscow evening event at the right moment in UTC', () => {
    // 19:46 Moscow is 16:46 UTC, so the day-before window opens a day earlier.
    expect(stageFor(event('19:46', { tzOffset: moscow }), utcPrev(16, 46), false)).toBe(1);
    expect(stageFor(event('19:46', { tzOffset: moscow }), utcPrev(16, 45), false)).toBeNull();
  });

  it('does not fire it three hours late', () => {
    expect(stageFor(event('19:46', { tzOffset: moscow }), utc(19, 46), false)).toBeNull();
  });

  it('handles a zone behind UTC', () => {
    // 08:00 in New York is 13:00 UTC, so the hour-before window opens at 12:00.
    expect(stageFor(event('08:00', { tzOffset: -300 }), utc(12, 0), false)).toBe(2);
    expect(stageFor(event('08:00', { tzOffset: -300 }), utc(11, 50), false)).toBe(1);
  });

  it('reminds a Tokyo morning while it is still evening in UTC', () => {
    // 08:00 on 06-16 in Tokyo is 23:00 on 06-15 in UTC. Three hours out, so the
    // day-before text is legitimately due - a server reading "tomorrow" in its
    // own zone would have called this event tomorrow for a day too long.
    const tokyo = 540;
    const tomorrow = new Date(Date.UTC(2026, 5, 16));
    expect(stageFor(event('08:00', { tzOffset: tokyo, date: tomorrow }), utc(20, 0), false)).toBe(1);
    // Two hours later it is inside the hour-before window instead.
    expect(stageFor(event('08:00', { tzOffset: tokyo, date: tomorrow }), utc(22, 0), false)).toBe(2);
    // And once it has begun, nothing.
    expect(stageFor(event('08:00', { tzOffset: tokyo, date: tomorrow }), utc(23, 30), false)).toBeNull();
  });

  it('keeps the old behaviour for events saved before the offset existed', () => {
    expect(stageFor(event('19:46', { tzOffset: null }), utcPrev(19, 46), false)).toBe(1);
    expect(stageFor(event('19:46', { tzOffset: null }), utc(19, 46), false)).toBeNull();
  });

  it('reads the stored date as UTC midnight, not local midnight', () => {
    // A 12:00 event opens its five-minute window at 11:55 UTC.
    expect(stageFor(event('12:00', { date: new Date(Date.UTC(2026, 5, 15)) }), utc(11, 55), false)).toBe(3);
  });
});

describe('selectDue', () => {
  it('returns the events with the stage each one is due for', () => {
    // At 19:00 the 19:46 event is 46 minutes out and the 23:00 one is four
    // hours out, so they are at different stages and must not be merged.
    const due = selectDue([event('19:46'), event('23:00')], utc(19, 0), false);
    const byTime = Object.fromEntries(due.map((d) => [d.event.time, d.stage]));
    expect(byTime['19:46']).toBe(2);
    expect(byTime['23:00']).toBe(1);
  });

  it('returns nothing for an event that has already started', () => {
    expect(selectDue([event('10:00')], utc(12, 0), false)).toEqual([]);
  });

  it('keeps events due at different stages apart', () => {
    const due = selectDue([event('19:46', { stage: 2 }), event('19:50')], utc(19, 45), false);
    expect(due.every((d) => d.stage === 3)).toBe(true);
  });
});
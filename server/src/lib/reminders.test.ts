import { describe, it, expect } from "vitest";
import { composeReminder, selectDue } from './reminders';

// The wording is what a lock screen shows first, and "Сегодня, (19:46)" came
// out of this function family on a real phone.
describe("reminder wording", () => {
  const at = (time: string | null, title = "Тест") => ({
    id: "x",
    title,
    time,
    userId: "u",
    date: new Date(),
  });

  it("names the time for a single timed event", () => {
    const out = composeReminder([at("19:46")]);
    expect(out.title).toBe("Сегодня в 19:46");
    expect(out.body).toBe("Тест");
  });

  it("has no stray bracket anywhere in the title", () => {
    for (const time of ["00:05", "9:05", "19:46", "23:59"]) {
      expect(composeReminder([at(time)]).title).not.toMatch(/[()]/);
    }
  });

  it("drops a meaningless time", () => {
    const out = composeReminder([at("00:05")]);
    expect(out.title).toBe("Сегодня в 00:05");
    expect(composeReminder([at("19:46")]).title).not.toBe("Сегодня в (19:46)");
  });

  it("says just today when there is no time", () => {
    expect(composeReminder([at(null)]).title).toBe("Сегодня");
  });

  it("counts several events correctly in Russian", () => {
    expect(composeReminder([at("10:00", "a"), at("11:00", "b")]).title).toBe("Сегодня: 2 события");
    expect(
      composeReminder([at("10:00", "a"), at("11:00", "b"), at("12:00", "c")]).title,
    ).toBe("Сегодня: 3 события");
    expect(
      composeReminder([
        at("10:00", "a"), at("11:00", "b"), at("12:00", "c"),
        at("13:00", "d"), at("14:00", "e"),
      ]).title,
    ).toBe("Сегодня: 5 событий");
    expect(
      composeReminder(Array.from({ length: 11 }, (_, i) => at(`1${i}:00`, `e${i}`))).title,
    ).toBe("Сегодня: 11 событий");
    expect(
      composeReminder(Array.from({ length: 21 }, (_, i) => at(`1${i % 10}:00`, `e${i}`))).title,
    ).toBe("Сегодня: 21 событие");
  });

  it("pairs times with titles when every event has one", () => {
    const out = composeReminder([at("10:00", "Встреча"), at("18:30", "Ужин")]);
    expect(out.body).toContain("10:00 · Встреча");
    expect(out.body).toContain("18:30 · Ужин");
  });

  it("lists bare titles when some event has no time", () => {
    const out = composeReminder([at(null, "День рождения"), at("18:30", "Ужин")]);
    expect(out.body).toContain("День рождения");
    expect(out.body).toContain("Ужин");
    expect(out.body).not.toMatch(/\d{2}:\d{2} · /);
  });

  it("says nothing about nothing", () => {
    expect(composeReminder([])).toEqual({ title: "", body: "" });
  });
});

describe("when a reminder is due", () => {
  // The complaint that produced this: an event at 19:46 produced a notification
  // at 19:50, because the sweep ran every ten minutes and said whatever the day
  // held. A reminder after the event has begun is worse than no reminder.
  const today = new Date(Date.UTC(2026, 5, 15));
  const event = (time: string | null, tzOffset: number | null = null) => ({
    id: "e",
    title: "Тест",
    time,
    userId: "u",
    date: today,
    tzOffset,
  });

  const day = new Date(Date.UTC(2026, 5, 15));
  const atUtc = (h: number, m: number) => new Date(Date.UTC(2026, 5, 15, h, m));
  const atLocal = atUtc;

  it("speaks up fifteen minutes before", () => {
    expect(selectDue([event("19:46")], atLocal(19, 31), false).length).toBe(1);
  });

  it("stays quiet before that", () => {
    expect(selectDue([event("19:46")], atLocal(19, 0), false).length).toBe(0);
    expect(selectDue([event("19:46")], atLocal(19, 30), false).length).toBe(0);
  });

  it("says nothing once the event has started", () => {
    expect(selectDue([event("19:46")], atLocal(19, 46), false).length).toBe(0);
    expect(selectDue([event("19:46")], atLocal(19, 50), false).length).toBe(0);
    expect(selectDue([event("19:46")], atLocal(23, 59), false).length).toBe(0);
  });

  it("mentions a timed-out event only on recovery, and never after it began", () => {
    expect(selectDue([event("19:46")], atLocal(19, 50), true).length).toBe(0);
    expect(selectDue([event("19:46")], atLocal(19, 20), true).length).toBe(1);
  });

  it("uses the event's own day, not the current one", () => {
    const tomorrow = new Date(today.getTime() + 86400000);
    const past = new Date(today.getTime() - 86400000);
    expect(selectDue([{ ...event("19:46"), date: tomorrow }], atLocal(19, 31), false).length).toBe(0);
    expect(selectDue([{ ...event("19:46"), date: past }], atLocal(19, 31), false).length).toBe(0);
  });

  it("reminds about an all-day event in the morning", () => {
    expect(selectDue([event(null)], atLocal(8, 59), false).length).toBe(0);
    expect(selectDue([event(null)], atLocal(9, 0), false).length).toBe(1);
  });

  it("ignores a malformed time instead of sending nothing at all", () => {
    expect(selectDue([event("не время")], atLocal(23, 59), false).length).toBe(0);
    expect(selectDue([event("25:99")], atLocal(23, 59), false).length).toBe(0);
  });
});

describe("the user's own clock, not the server's", () => {
  const today = new Date(Date.UTC(2026, 5, 15));
  const utc = (h: number, m: number) => new Date(Date.UTC(2026, 5, 15, h, m));
  const event = (time: string | null, tzOffset: number | null) => ({
    id: "e", title: "Тест", time, userId: "u", date: today, tzOffset,
  });

  // 19:46 entered in Moscow is 16:46 UTC. Taking the wall clock at face value
  // would remind three hours late - the bug right after "arrived after the
  // event".
  const moscow = 180;

  it("fires a Moscow evening event at the right moment in UTC", () => {
    expect(selectDue([event("19:46", moscow)], utc(16, 31), false).length).toBe(1);
    expect(selectDue([event("19:46", moscow)], utc(16, 30), false).length).toBe(0);
  });

  it("does not fire it three hours late", () => {
    expect(selectDue([event("19:46", moscow)], utc(19, 46), false).length).toBe(0);
  });

it("says nothing about a morning event before its time in UTC", () => {
    // 08:00 in Moscow is 05:00 UTC, so the lead time opens at 04:45 UTC.
    expect(selectDue([event("08:00", moscow)], utc(4, 44), false).length).toBe(0);
    expect(selectDue([event("08:00", moscow)], utc(4, 45), false).length).toBe(1);
    expect(selectDue([event("08:00", moscow)], utc(4, 50), false).length).toBe(1);
  });

  it("handles a zone behind UTC", () => {
    // 08:00 in New York is 13:00 UTC.
    expect(selectDue([event("08:00", -300)], utc(12, 50), false).length).toBe(1);
    expect(selectDue([event("08:00", -300)], utc(12, 40), false).length).toBe(0);
  });

  it("is quiet about a day that is still tomorrow over there", () => {
    const tokyo = 540;
    const tomorrow = new Date(Date.UTC(2026, 5, 16));
    expect(selectDue([{ ...event("08:00", tokyo), date: tomorrow }], utc(20, 0), false).length).toBe(0);
  });

  it("keeps the old behaviour for events saved before the offset existed", () => {
    expect(selectDue([event("19:46", null)], utc(19, 31), false).length).toBe(1);
    expect(selectDue([event("19:46", null)], utc(19, 46), false).length).toBe(0);
  });

  it("reads the stored date as UTC midnight, not local midnight", () => {
    // A column written at UTC midnight must not slide to the previous day just
    // because the process happens to run west of Greenwich.
    const row = { ...event("12:00", null), date: new Date(Date.UTC(2026, 5, 15)) };
    expect(selectDue([row], utc(11, 45), false).length).toBe(1);
  });
});

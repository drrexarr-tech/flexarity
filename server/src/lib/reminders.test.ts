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
  const today = new Date();
  const event = (time: string | null) => ({ id: "e", title: "Тест", time, userId: "u", date: today });

  const atLocal = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

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

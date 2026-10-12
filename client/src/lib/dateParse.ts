/**
 * Pulls a date and a time out of an event title.
 *
 * Tapping a day in the calendar picks that day, and typing a title is meant to
 * be about the event, not about re-stating the day. But "Встреча 15.10 в 18:00"
 * names a day, and it used to land on whichever cell happened to be selected.
 * Whatever the title says wins.
 *
 * Deliberately conservative: it returns a match only for shapes it is sure of,
 * and never rewrites the title unless it removed something it parsed. A title
 * that is only a word never turns into a date.
 */

/**
 * Russian names a date in the genitive: "5 ноября", not "5 ноябрь". The first
 * version listed only the nominative forms, so every written month silently
 * failed to parse and the event stayed on whatever day was tapped.
 */
const MONTHS: Record<string, number> = {
  январь: 1, января: 1, янв: 1,
  февраль: 2, февраля: 2, фев: 2, февр: 2,
  март: 3, марта: 3, мар: 3,
  апрель: 4, апреля: 4, апр: 4,
  май: 5, мая: 5,
  июнь: 6, июня: 6, июн: 6,
  июль: 7, июля: 7, июл: 7,
  август: 8, августа: 8, авг: 8,
  сентябрь: 9, сентября: 9, сент: 9, сен: 9,
  октябрь: 10, октября: 10, окт: 10,
  ноябрь: 11, ноября: 11, ноябр: 11, нояб: 11, ноя: 11,
  декабрь: 12, декабря: 12, дек: 12,
};

const WEEKDAYS: Record<string, number> = {
  понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4, пятница: 5,
  пятницу: 5, суббота: 6, субботу: 6, воскресенье: 0, воскресенья: 0,
};

const pad = (n: number) => String(n).padStart(2, '0');

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Next occurrence of a weekday, today if it is today. */
function nextWeekday(base: Date, target: number): Date {
  const d = new Date(base);
  const diff = (target - d.getDay() + 7) % 7;
  return addDays(d, diff);
}

export interface ParsedWhen {
  date: string | null;
  time: string | null;
  /** The title with the parsed fragment removed, if anything was removed. */
  title: string;
}

const EMPTY: ParsedWhen = { date: null, time: null, title: '' };

/**
 * Month names need a boundary: "в мае" is a date, "в магазине" is not. The
 * stems are checked first so "сентябрь" wins over the shorter "сен".
 */
const MONTH_ALTERNATION = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

/** A date already past this year means next year, not a booking in the past. */
function resolveYear(month: number, day: number, explicit: number | undefined, now: Date): number {
  if (explicit !== undefined) return explicit;
  const candidate = new Date(now.getFullYear(), month - 1, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return now.getFullYear() + 1;
  }
  return now.getFullYear();
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  // Rejects 31 February and 29 February in a common year.
  return dt.getMonth() === month - 1 && dt.getDate() === day;
}

export function parseWhenFromTitle(title: string, now = new Date()): ParsedWhen {
  if (!title || !title.trim()) return { ...EMPTY };

  let date: string | null = null;
  let time: string | null = null;
  let rest = ` ${title.trim()} `;

  const take = (replaced: string) => {
    rest = rest.replace(replaced, ' ');
  };

  // Time first, so "10.10 18:00" does not lose the time to the date pattern.
  // Colon only: a dot here would swallow "15.10", which is a date, and report
  // the event as 15:10 today.
  const timeRe = /(?:^|\s)(?:в\s+|с\s+)?(\d{1,2}):(\d{2})(?:\s*[-–—]\s*(?:\d{1,2}):(\d{2}))?(?=\s|$)/;
  const timeMatch = rest.match(timeRe);
  if (timeMatch) {
    const h = Number(timeMatch[1]);
    const m = Number(timeMatch[2]);
    // 25:00 is not a time.
    if (h <= 23 && m <= 59) {
      time = `${pad(h)}:${pad(m)}`;
      take(timeMatch[0]);
    }
  }

  // ISO date.
  const isoMatch = rest.match(/(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number);
    if (isRealDate(y, m, d)) {
      date = toIso(new Date(y, m - 1, d));
      take(isoMatch[0]);
    }
  }

  // dd.mm or dd.mm.yyyy
  if (!date) {
    const dm = rest.match(
      /(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s|$)/
    );
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]);
      let year: number | undefined;
      if (dm[3]) {
        const raw = Number(dm[3]);
        year = dm[3].length === 2 ? 2000 + raw : raw;
      }
      const resolved = resolveYear(month, day, year, now);
      if (isRealDate(resolved, month, day)) {
        date = toIso(new Date(resolved, month - 1, day));
        take(dm[0]);
      }
    }
  }

  // "15 октября" / "15 окт"
  if (!date) {
    const wordMonth = rest.match(
      new RegExp(`(?:^|\\s)(\\d{1,2})\\s+(?:${MONTH_ALTERNATION})(?:\\s+(\\d{4}))?(?=\\s|$)`, 'i')
    );
    if (wordMonth) {
      const day = Number(wordMonth[1]);
      const stem = wordMonth[0]
        .toLowerCase()
        .replace(/^\s*\d{1,2}\s+/, '')
        .split(/\s+/)[0];
      const month = MONTHS[stem];
      const explicit = wordMonth[2] ? Number(wordMonth[2]) : undefined;
      if (month !== undefined) {
        const resolved = resolveYear(month, day, explicit, now);
        if (isRealDate(resolved, month, day)) {
          date = toIso(new Date(resolved, month - 1, day));
          take(wordMonth[0]);
        }
      }
    }
  }

  // Relative words.
  if (!date) {
    const today = rest.match(/(?:^|\s)сегодня(?=\s|$)/i);
    const tomorrow = rest.match(/(?:^|\s)завтра(?=\s|$)/i);
    const dayAfter = rest.match(/(?:^|\s)послезавтра(?=\s|$)/i);
    const inDays = rest.match(/(?:^|\s)через\s+(\d{1,3})\s*(дн|дня|дней)(?=\s|$)/i);

    if (inDays) {
      date = toIso(addDays(now, Number(inDays[1])));
      take(inDays[0]);
    } else if (dayAfter) {
      date = toIso(addDays(now, 2));
      take(dayAfter[0]);
    } else if (tomorrow) {
      date = toIso(addDays(now, 1));
      take(tomorrow[0]);
    } else if (today) {
      date = toIso(now);
      take(today[0]);
    }
  }

  // Weekday names, only with an explicit preposition so "план" is not a day.
  if (!date) {
    for (const [word, target] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`(?:^|\\s)(?:в|во|к|в\\s+эту?)\\s+${word}(?=\\s|$)`, 'i');
      const m = rest.match(re);
      if (m) {
        date = toIso(nextWeekday(now, target));
        take(m[0]);
        break;
      }
    }
  }

  if (!date && !time) return { date: null, time: null, title };

  // Tidy what is left: collapse the spaces left behind, drop dangling
  // prepositions, and never return an empty title.
  const cleaned = rest
    .replace(/\s{2,}/g, ' ')
    .replace(/(^|\s)(в|во|к|с|от)\s*$/i, '$1')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim();

  return { date, time, title: cleaned || title.trim() };
}
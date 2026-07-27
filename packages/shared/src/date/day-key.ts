/**
 * Day keys (ARCHITECTURE.md §3, §10).
 *
 * Day-scoped data — habitLogs, checkins, dueDate, event dates — is keyed by a
 * "YYYY-MM-DD" *string* in the user's own timezone, never by a Date. Strings
 * sort lexicographically, index cleanly in Mongo, and cannot drift by a day when
 * a UTC server talks to a user in Asia/Kolkata.
 *
 * The rule that matters: never derive a day key from a bare `new Date()` on the
 * server. Always go through `toDayKey(instant, user.timezone)`.
 *
 * All arithmetic here is pure string/UTC math, so it is immune to the host's
 * local zone and to DST entirely.
 */

/** A "YYYY-MM-DD" calendar day, e.g. "2026-07-26". */
export type DayKey = string;

/** A "YYYY-MM" calendar month, e.g. "2026-07". */
export type MonthKey = string;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export interface DayParts {
  year: number;
  /** 1–12, not the 0-based month a Date would give you. */
  month: number;
  day: number;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Shape check plus a real calendar check — "2026-02-31" is not a day key. */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !DAY_KEY_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== "string" || !MONTH_KEY_RE.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function assertDayKey(value: unknown): DayKey {
  if (!isDayKey(value)) {
    throw new TypeError(`Expected a "YYYY-MM-DD" day key, received ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertMonthKey(value: unknown): MonthKey {
  if (!isMonthKey(value)) {
    throw new TypeError(`Expected a "YYYY-MM" month key, received ${JSON.stringify(value)}`);
  }
  return value;
}

/** Days in a month, 1-based month. Handles leap years. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDayKey(key: DayKey): DayParts {
  assertDayKey(key);
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  };
}

export function formatDayKey(parts: DayParts): DayKey {
  return `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * The calendar day `instant` falls on **in `timeZone`**.
 *
 * This is the only place an instant becomes a day. Uses Intl rather than any
 * offset arithmetic, so it is correct across DST and odd offsets like +05:30.
 */
export function toDayKey(instant: Date, timeZone: string): DayKey {
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("toDayKey received an Invalid Date");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not resolve a calendar day in timezone "${timeZone}"`);
  }
  return `${year.padStart(4, "0")}-${month}-${day}`;
}

/** Today, in the user's timezone. `now` is injectable so tests stay deterministic. */
export function todayKey(timeZone: string, now: Date = new Date()): DayKey {
  return toDayKey(now, timeZone);
}

/**
 * Midnight UTC on that calendar day. Only for arithmetic and for Mongo range
 * queries against real Date fields — never store this as a day.
 */
export function dayKeyToUtcDate(key: DayKey): Date {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(key: DayKey, days: number): DayKey {
  const shifted = new Date(dayKeyToUtcDate(key).getTime() + days * MS_PER_DAY);
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${pad2(
    shifted.getUTCMonth() + 1,
  )}-${pad2(shifted.getUTCDate())}`;
}

export function addMonths(key: DayKey, months: number): DayKey {
  const { year, month, day } = parseDayKey(key);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  // Clamp: 2026-01-31 + 1 month is 2026-02-28, not 2026-03-03.
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatDayKey({ year: targetYear, month: targetMonth, day: targetDay });
}

export function addYears(key: DayKey, years: number): DayKey {
  const { year, month, day } = parseDayKey(key);
  const targetYear = year + years;
  // Clamp 29 Feb in a non-leap target year.
  const targetDay = Math.min(day, daysInMonth(targetYear, month));
  return formatDayKey({ year: targetYear, month, day: targetDay });
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(from: DayKey, to: DayKey): number {
  return Math.round((dayKeyToUtcDate(to).getTime() - dayKeyToUtcDate(from).getTime()) / MS_PER_DAY);
}

/** Lexicographic comparison is correct for this format — that is the point of it. */
export function compareDayKeys(a: DayKey, b: DayKey): -1 | 0 | 1 {
  assertDayKey(a);
  assertDayKey(b);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function isBefore(a: DayKey, b: DayKey): boolean {
  return compareDayKeys(a, b) === -1;
}

export function isAfter(a: DayKey, b: DayKey): boolean {
  return compareDayKeys(a, b) === 1;
}

/** 0 = Sunday … 6 = Saturday. For heatmap column alignment. */
export function weekdayOf(key: DayKey): number {
  return dayKeyToUtcDate(key).getUTCDay();
}

export function monthKeyOf(key: DayKey): MonthKey {
  assertDayKey(key);
  return key.slice(0, 7);
}

export interface MonthRange {
  month: MonthKey;
  start: DayKey;
  end: DayKey;
  /** Every day of the month, in order. */
  days: DayKey[];
}

/** The full span of a "YYYY-MM" — inclusive of both ends. */
export function monthRange(month: MonthKey): MonthRange {
  assertMonthKey(month);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const total = daysInMonth(year, monthNumber);
  const days: DayKey[] = [];
  for (let day = 1; day <= total; day += 1) {
    days.push(formatDayKey({ year, month: monthNumber, day }));
  }
  const start = `${month}-01`;
  const end = `${month}-${pad2(total)}`;
  return { month, start, end, days };
}

/**
 * Split a run of day keys into consecutive segments.
 *
 * The vitals chart draws one polyline per segment so a missed day breaks the
 * line instead of being interpolated across (DESIGN.md §6).
 */
export function consecutiveSegments(keys: readonly DayKey[]): DayKey[][] {
  const segments: DayKey[][] = [];
  let current: DayKey[] = [];
  for (const key of keys) {
    const previous = current[current.length - 1];
    if (previous !== undefined && diffDays(previous, key) !== 1) {
      segments.push(current);
      current = [];
    }
    current.push(key);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

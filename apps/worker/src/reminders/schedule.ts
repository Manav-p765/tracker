/**
 * Local-time window arithmetic (ARCHITECTURE.md §5).
 *
 * This module exists because "is it 21:00 for this user?" is the single most
 * dangerous question in the codebase, and this project has already shipped three
 * UTC-vs-IST bugs. Everything here works in **minutes since local midnight**,
 * derived through Intl in the user's own zone — never by adding an offset, never
 * by reading the server clock.
 */

import { addDays, todayKey, type DayKey } from "@tracker/shared";

/** Minutes since midnight, in `timeZone`, for a given instant. */
export function localMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  let hour: string | undefined;
  let minute: string | undefined;
  for (const part of parts) {
    if (part.type === "hour") hour = part.value;
    else if (part.type === "minute") minute = part.value;
  }
  if (hour === undefined || minute === undefined) {
    throw new Error(`Could not read local time in "${timeZone}"`);
  }
  return Number(hour) * 60 + Number(minute);
}

/** "HH:mm" → minutes since midnight. */
export function parseTimeOfDay(time: string): number {
  const [hour, minute] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

export interface WindowHit {
  /**
   * The day the reminder BELONGS to, which is not always today.
   *
   * A 23:58 reminder evaluated by the 00:01 scan is still yesterday's reminder.
   * Without this the jobId would change at midnight and the user would be
   * notified twice for one reminder.
   */
  day: DayKey;
  minutesLate: number;
}

/**
 * Is `instant` inside the [target, target + window) slot, in the user's zone?
 *
 * Wraps around midnight, so a 23:58 target still matches a 00:01 scan.
 */
export function hitsWindow(
  instant: Date,
  timeZone: string,
  targetTime: string,
  windowMinutes: number,
): WindowHit | null {
  const now = localMinutes(instant, timeZone);
  const target = parseTimeOfDay(targetTime);

  // Modulo keeps a target just before midnight matching a scan just after it.
  const minutesLate = ((now - target) % 1440 + 1440) % 1440;
  if (minutesLate >= windowMinutes) return null;

  const today = todayKey(timeZone, instant);
  // If the clock has wrapped past midnight since the target, this is yesterday's.
  const day = now >= target ? today : addDays(today, -1);

  return { day, minutesLate };
}

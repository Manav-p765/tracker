/**
 * The user's timezone, and today in it.
 *
 * ARCHITECTURE.md §10: never build a day key from a bare `new Date()` on the
 * server. Every "is this overdue", "what is today", "stamp the completion date"
 * decision routes through here, so a UTC server and a user in Asia/Kolkata always
 * agree about which day it is.
 */

import { todayKey, type DayKey } from "@tracker/shared";

import { AppError } from "../errors.js";
import { User } from "../models/index.js";

export async function getUserTimezone(userId: string): Promise<string> {
  const user = await User.findById(userId).select("timezone").lean();
  if (user === null) throw AppError.unauthorized("Account no longer exists");
  return user.timezone;
}

/** Today's day key in the user's own timezone. `now` is injectable for tests. */
export async function getTodayKey(userId: string, now: Date = new Date()): Promise<DayKey> {
  return todayKey(await getUserTimezone(userId), now);
}

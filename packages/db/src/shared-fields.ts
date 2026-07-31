/**
 * Field definitions repeated across collections (ARCHITECTURE.md §3).
 *
 * Day-keyed data uses a "YYYY-MM-DD" String, never a Date: it cannot drift by a
 * day between a UTC server and a user in Asia/Kolkata, it sorts
 * lexicographically, and it indexes cleanly.
 */

import { Schema } from "mongoose";

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Required day key, e.g. a habitLog or checkin `date`. */
export const requiredDayKey = {
  type: String,
  required: true,
  match: DAY_KEY_PATTERN,
} as const;

/** Optional day key, e.g. `dueDate`, `completedDate`, `targetDate`. */
export const optionalDayKey = {
  type: String,
  match: DAY_KEY_PATTERN,
} as const;

/** Every user-owned document carries this. Single-user product, multi-user model. */
export const userIdField = {
  type: Schema.Types.ObjectId,
  ref: "User",
  required: true,
  index: true,
} as const;

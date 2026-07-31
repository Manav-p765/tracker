/**
 * Check-in payload schemas (SCOPE.md §3, ARCHITECTURE.md §4).
 *
 * One document per user per day, upserted. Every field except `date` is optional,
 * because a partial check-in is a valid check-in — logging only your mood at
 * lunchtime and the rest at night must both work, and neither may wipe the other.
 *
 * `null` is meaningful here and distinct from absent:
 *   - absent  → leave whatever is stored alone
 *   - null    → clear the field
 * Without that distinction a one-tap mood log would blank the moment you typed.
 */

import { z } from "zod";

import { SCALE_MAX, SCALE_MIN, SLEEP_MAX, SLEEP_MIN } from "../domain/scales.js";
import { dayKeySchema, monthKeySchema, objectIdSchema } from "./common.js";

/** How far back a missed evening may be filled in. */
export const BACKFILL_WINDOW_DAYS = 14;

const scaleSchema = z
  .number()
  .int(`Pick one of the ${SCALE_MAX} squares`)
  .min(SCALE_MIN)
  .max(SCALE_MAX);

const sleepHoursSchema = z
  .number()
  .min(SLEEP_MIN)
  .max(SLEEP_MAX)
  .refine((value) => Math.round(value * 2) === value * 2, {
    message: "Sleep is logged in half-hour steps",
  });

export const upsertCheckinSchema = z
  .object({
    /** Defaults to today in the user's timezone when omitted. */
    date: dayKeySchema.optional(),
    intention: z.string().trim().max(280).nullable().optional(),
    mood: scaleSchema.nullable().optional(),
    energy: scaleSchema.nullable().optional(),
    sleepHours: sleepHoursSchema.nullable().optional(),
    moment: z.string().trim().max(280).nullable().optional(),
    /** Daily goals ticked during this check-in. Completed via goalService. */
    completedGoalIds: z.array(objectIdSchema).max(50).optional(),
    /** Set true by the evening flow's single Done. Partial saves leave it alone. */
    completed: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "date"),
    { message: "Nothing to log" },
  );
export type UpsertCheckinInput = z.infer<typeof upsertCheckinSchema>;

export const checkinMonthQuerySchema = z.object({ month: monthKeySchema });
export type CheckinMonthQuery = z.infer<typeof checkinMonthQuerySchema>;

export const checkinDateParamSchema = z.object({ date: dayKeySchema });

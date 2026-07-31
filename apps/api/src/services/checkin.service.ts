/**
 * The daily check-in (SCOPE.md §3) — the app's heartbeat.
 *
 * Three rules hold this together:
 *
 *  1. **One document per {userId, date}, always upserted.** The unique index does
 *     the enforcing; this service never inserts conditionally, so two submissions
 *     on the same day cannot race into two rows.
 *  2. **Partial saves never clobber.** Only the keys the caller actually sent are
 *     `$set`. An absent field is left alone; an explicit `null` clears it. That
 *     distinction is what lets a one-tap mood log coexist with a typed moment.
 *  3. **Goal completion is not re-implemented here.** `completedGoalIds` is
 *     applied through goalService.setGoalCompleted, so the completion date is
 *     stamped once, in the user's timezone, by the same code the goals screen uses.
 */

import {
  BACKFILL_WINDOW_DAYS,
  addDays,
  monthRange,
  todayKey,
  type Checkin as CheckinDto,
  type CheckinOrEmpty,
  type DayKey,
  type MonthKey,
  type UpsertCheckinInput,
} from "@tracker/shared";
import { Types } from "mongoose";

import { AppError, ERROR_CODES } from "../errors.js";
import { Checkin, type CheckinDoc } from "@tracker/db";
import { emitToUser } from "../realtime/socket.js";
import { setGoalCompleted } from "./goal.service.js";
import { getUserTimezone } from "./user-context.service.js";

function toCheckinDto(doc: CheckinDoc): CheckinDto {
  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    date: doc.date,
    ...(doc.intention === undefined ? {} : { intention: doc.intention }),
    ...(doc.mood === undefined ? {} : { mood: doc.mood }),
    ...(doc.energy === undefined ? {} : { energy: doc.energy }),
    ...(doc.sleepHours === undefined ? {} : { sleepHours: doc.sleepHours }),
    ...(doc.moment === undefined ? {} : { moment: doc.moment }),
    completedGoalIds: doc.completedGoalIds.map(String),
    completed: doc.completed,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Validates the day against the user's own calendar.
 *
 * Two different refusals, because they are different mistakes: a future date is a
 * clock problem, an ancient date is a "you probably meant a different day" problem.
 */
function assertLoggableDate(date: DayKey, today: DayKey): void {
  if (date > today) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      422,
      "That day has not happened yet in your timezone",
    );
  }
  if (date < addDays(today, -BACKFILL_WINDOW_DAYS)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      422,
      `You can fill in the last ${BACKFILL_WINDOW_DAYS} days — ${date} is further back than that`,
    );
  }
}

/**
 * Upsert one day's check-in.
 *
 * Returns the whole document, so the client can patch its cache without a refetch.
 */
export async function upsertCheckin(
  userId: string,
  input: UpsertCheckinInput,
  now?: Date,
): Promise<CheckinDto> {
  const timezone = await getUserTimezone(userId);
  const today = todayKey(timezone, now ?? new Date());
  const date = input.date ?? today;

  assertLoggableDate(date, today);

  // Only what was actually sent. `null` clears, absent leaves alone.
  const set: Record<string, unknown> = {};
  const unset: Record<string, "">= {};

  const assign = (key: keyof UpsertCheckinInput, value: unknown): void => {
    if (value === undefined) return;
    if (value === null) unset[key] = "";
    else set[key] = value;
  };

  assign("intention", input.intention);
  assign("mood", input.mood);
  assign("energy", input.energy);
  assign("sleepHours", input.sleepHours);
  assign("moment", input.moment);
  if (input.completed !== undefined) set.completed = input.completed;
  if (input.completedGoalIds !== undefined) {
    set.completedGoalIds = input.completedGoalIds.map((id) => new Types.ObjectId(id));
  }

  const updated = await Checkin.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), date },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      $setOnInsert: { userId: new Types.ObjectId(userId), date },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (updated === null) throw AppError.internal("Could not save the check-in");

  /**
   * Tick the goals through the existing service rather than writing statuses here.
   * Done after the upsert so a rejected goal id cannot leave the check-in unsaved.
   */
  if (input.completedGoalIds !== undefined) {
    for (const goalId of input.completedGoalIds) {
      await setGoalCompleted(userId, goalId, true, now);
    }
  }

  const dto = toCheckinDto(updated);
  emitToUser(userId, "checkin:changed", { date: dto.date, checkin: dto });
  return dto;
}

/** Today's check-in, or an empty shell so the UI can render "nothing logged yet". */
export async function getCheckin(
  userId: string,
  date?: DayKey,
  now?: Date,
): Promise<CheckinOrEmpty> {
  const timezone = await getUserTimezone(userId);
  const day = date ?? todayKey(timezone, now ?? new Date());

  const found = await Checkin.findOne({ userId, date: day }).lean();
  if (found === null) return { date: day, exists: false };

  return { ...toCheckinDto(found), exists: true };
}

/** A month of check-ins, oldest first. The Phase 1.5 history charts read this. */
export async function listCheckins(userId: string, month: MonthKey): Promise<CheckinDto[]> {
  const range = monthRange(month);
  const found = await Checkin.find({
    userId,
    date: { $gte: range.start, $lte: range.end },
  })
    .sort({ date: 1 })
    .lean();

  return found.map(toCheckinDto);
}

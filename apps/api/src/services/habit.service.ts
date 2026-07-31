/**
 * Habit rules (SCOPE.md §4.2).
 *
 * Three things worth knowing before changing anything here:
 *
 *  1. **An un-ticked day is the absence of a row.** `done: false` deletes the log
 *     rather than storing a negative, so the grid can never disagree with itself
 *     about what a missing day means.
 *  2. **The write path is one idempotent upsert** on the unique
 *     { userId, habitId, date } index. Double-tapping is safe by construction, not
 *     by a guard.
 *  3. **Archiving keeps every log.** It sets archivedAt, which removes the habit
 *     from today's grid and nothing else — the history stays readable.
 */

import {
  addDays,
  monthRange,
  todayKey,
  type CreateHabitInput,
  type DayKey,
  type Habit as HabitDto,
  type HabitGridRow,
  type HabitLogInput,
  type HabitStreak,
  type MonthKey,
  type UpdateHabitInput,
} from "@tracker/shared";
import { Types } from "mongoose";

import { AppError, ERROR_CODES } from "../errors.js";
import { Habit, HabitLog, type HabitDoc } from "@tracker/db";
import { emitToUser } from "../realtime/socket.js";
import { getUserTimezone } from "./user-context.service.js";

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

function toHabitDto(habit: HabitDoc): HabitDto {
  return {
    _id: String(habit._id),
    userId: String(habit.userId),
    name: habit.name,
    pastel: habit.pastel,
    pixelGlyph: habit.pixelGlyph,
    ...(habit.targetPerWeek === undefined ? {} : { targetPerWeek: habit.targetPerWeek }),
    sortOrder: habit.sortOrder,
    archivedAt: habit.archivedAt === null ? null : (habit.archivedAt?.toISOString() ?? null),
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
}

/** The next free slot, so a new habit lands at the bottom of the grid. */
async function nextSortOrder(userId: string): Promise<number> {
  const last = await Habit.findOne({ userId }).sort({ sortOrder: -1 }).select("sortOrder").lean();
  return last === null ? 0 : last.sortOrder + 1;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listHabits(userId: string, includeArchived = false): Promise<HabitDto[]> {
  const habits = await Habit.find(includeArchived ? { userId } : { userId, archivedAt: null })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return habits.map(toHabitDto);
}

export async function createHabit(userId: string, input: CreateHabitInput): Promise<HabitDto> {
  const created = await Habit.create({
    userId: new Types.ObjectId(userId),
    name: input.name,
    ...(input.pastel === undefined ? {} : { pastel: input.pastel }),
    ...(input.pixelGlyph === undefined ? {} : { pixelGlyph: input.pixelGlyph }),
    ...(input.targetPerWeek === undefined ? {} : { targetPerWeek: input.targetPerWeek }),
    sortOrder: input.sortOrder ?? (await nextSortOrder(userId)),
  });

  const dto = toHabitDto(created.toObject());
  emitToUser(userId, "habit:created", dto);
  return dto;
}

export async function updateHabit(
  userId: string,
  habitId: string,
  patch: UpdateHabitInput,
): Promise<HabitDto> {
  const habit = await Habit.findOne({ _id: habitId, userId });
  if (habit === null) throw AppError.notFound("No such habit");

  if (patch.name !== undefined) habit.name = patch.name;
  if (patch.pastel !== undefined) habit.pastel = patch.pastel;
  if (patch.pixelGlyph !== undefined) habit.pixelGlyph = patch.pixelGlyph;
  if (patch.targetPerWeek !== undefined) {
    habit.set("targetPerWeek", patch.targetPerWeek ?? undefined);
  }
  if (patch.sortOrder !== undefined) habit.sortOrder = patch.sortOrder;

  await habit.save();

  const dto = toHabitDto(habit.toObject());
  emitToUser(userId, "habit:updated", dto);
  return dto;
}

/** Archive, or restore. History is untouched either way. */
export async function setHabitArchived(
  userId: string,
  habitId: string,
  archived: boolean,
): Promise<HabitDto> {
  const habit = await Habit.findOne({ _id: habitId, userId });
  if (habit === null) throw AppError.notFound("No such habit");

  habit.archivedAt = archived ? new Date() : null;
  await habit.save();

  const dto = toHabitDto(habit.toObject());
  emitToUser(userId, "habit:archived", dto);
  return dto;
}

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

/**
 * Tick or un-tick one day.
 *
 * Backfill is allowed — you can open a past day and log it (SCOPE.md §3) — but a
 * future date is refused: a habit you have not done yet is not a habit you did.
 */
export async function setHabitLog(
  userId: string,
  input: HabitLogInput,
  now?: Date,
): Promise<{ habitId: string; date: DayKey; done: boolean }> {
  const timezone = await getUserTimezone(userId);
  const today = todayKey(timezone, now ?? new Date());

  if (input.date > today) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      422,
      "That day has not happened yet in your timezone",
    );
  }

  const habit = await Habit.findOne({ _id: input.habitId, userId }).select("_id").lean();
  if (habit === null) throw AppError.notFound("No such habit");

  if (input.done) {
    // The unique index makes this idempotent: a second tap writes the same row.
    await HabitLog.updateOne(
      { userId, habitId: input.habitId, date: input.date },
      { $set: { done: true } },
      { upsert: true },
    );
  } else {
    await HabitLog.deleteOne({ userId, habitId: input.habitId, date: input.date });
  }

  const payload = { habitId: input.habitId, date: input.date, done: input.done };
  emitToUser(userId, "habitLog:changed", payload);
  return payload;
}

// ---------------------------------------------------------------------------
// grid
// ---------------------------------------------------------------------------

/**
 * The habits × days matrix behind the X-mark grid.
 *
 * One aggregation, not one query per habit: a $lookup pulls each habit's logs for
 * the window in the same round trip. With a month of history and a dozen habits the
 * N+1 version would be 12 extra queries every time the screen opens.
 */
export async function habitGrid(
  userId: string,
  from: DayKey,
  to: DayKey,
  includeArchived = false,
): Promise<HabitGridRow[]> {
  const rows = await Habit.aggregate<HabitDoc & { logs: { date: DayKey }[] }>([
    { $match: { userId: new Types.ObjectId(userId), ...(includeArchived ? {} : { archivedAt: null }) } },
    { $sort: { sortOrder: 1, createdAt: 1 } },
    {
      $lookup: {
        from: "habitLogs",
        let: { habitId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$habitId", "$$habitId"] },
                  { $eq: ["$userId", new Types.ObjectId(userId)] },
                  { $gte: ["$date", from] },
                  { $lte: ["$date", to] },
                ],
              },
            },
          },
          { $project: { _id: 0, date: 1 } },
        ],
        as: "logs",
      },
    },
  ]);

  return rows.map((row) => {
    const days: Record<DayKey, boolean> = {};
    for (const log of row.logs) days[log.date] = true;
    return { habit: toHabitDto(row), days };
  });
}

// ---------------------------------------------------------------------------
// heatmap
// ---------------------------------------------------------------------------

export interface HeatmapDay {
  date: DayKey;
  done: boolean;
  /** True once the day is in the future — rendered as absent, not as a miss. */
  future: boolean;
}

export interface HabitHeatmap {
  month: MonthKey;
  habit: HabitDto;
  days: HeatmapDay[];
  /** Completed days ÷ days elapsed. Drives the per-week density rules. */
  completed: number;
  elapsed: number;
}

export async function habitHeatmap(
  userId: string,
  habitId: string,
  month: MonthKey,
  now?: Date,
): Promise<HabitHeatmap> {
  const timezone = await getUserTimezone(userId);
  const today = todayKey(timezone, now ?? new Date());

  const habit = await Habit.findOne({ _id: habitId, userId }).lean();
  if (habit === null) throw AppError.notFound("No such habit");

  const range = monthRange(month);
  const logs = await HabitLog.find({
    userId,
    habitId,
    date: { $gte: range.start, $lte: range.end },
  })
    .select("date")
    .lean();

  const ticked = new Set(logs.map((log) => log.date));
  const days: HeatmapDay[] = range.days.map((date) => ({
    date,
    done: ticked.has(date),
    future: date > today,
  }));

  return {
    month,
    habit: toHabitDto(habit),
    days,
    completed: days.filter((day) => day.done).length,
    elapsed: days.filter((day) => !day.future).length,
  };
}

// ---------------------------------------------------------------------------
// streak
// ---------------------------------------------------------------------------

/**
 * Current and longest run of consecutive days.
 *
 * The one judgement call: an unlogged **today** does not break the current streak.
 * The run is measured from today if today is ticked, otherwise from yesterday — so
 * a habit logged every evening does not read 0 all morning. Two clear days ends it.
 *
 * Presented as a plain number. No flame, no badge, no celebration (SCOPE.md §6).
 */
export async function habitStreak(
  userId: string,
  habitId: string,
  now?: Date,
): Promise<HabitStreak> {
  const timezone = await getUserTimezone(userId);
  const today = todayKey(timezone, now ?? new Date());

  const habit = await Habit.findOne({ _id: habitId, userId }).select("_id").lean();
  if (habit === null) throw AppError.notFound("No such habit");

  // Newest first: the streak walk only ever needs the recent end, and `longest`
  // is a single pass either way.
  const logs = await HabitLog.find({ userId, habitId }).select("date").sort({ date: -1 }).lean();
  if (logs.length === 0) return { current: 0, longest: 0 };

  const dates = logs.map((log) => log.date);
  const ticked = new Set(dates);

  // Current: start at today, or yesterday if today is not logged yet.
  let cursor = ticked.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (ticked.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest: one pass over the descending dates.
  let longest = 1;
  let run = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1];
    const date = dates[index];
    if (previous === undefined || date === undefined) continue;
    // Descending, so the older date should be exactly one day before.
    run = addDays(previous, -1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return { current, longest: Math.max(longest, current) };
}

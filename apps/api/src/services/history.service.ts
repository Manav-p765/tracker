/**
 * The history screen's data, in one response (ARCHITECTURE.md §4).
 *
 * This is the one place the API deliberately batches. The screen is read-only and
 * read-heavy — five per-day series, a heatmap and the moments list — and fetching
 * them separately would mean five round trips for a screen that is useless until
 * all of them arrive.
 *
 * **Honest gaps are the rule here.** A day with no underlying row is `null`, never
 * `0`, and the client breaks the line rather than interpolating. That matters most
 * for the counted series: because un-ticking a habit *deletes* the row, "logged
 * nothing" and "never opened the app" are indistinguishable in the data. Drawing
 * either as zero would be a claim the database cannot support.
 */

import {
  monthRange,
  toDayKey,
  todayKey,
  type DayKey,
  type MonthKey,
} from "@tracker/shared";
import { Types } from "mongoose";

import { Checkin, Goal, Habit, HabitLog } from "@tracker/db";
import { getUserTimezone } from "./user-context.service.js";

export type HistorySeriesKey = "habits" | "sleep" | "tasks" | "mood" | "energy";

/** One day of the habit heatmap: how many of that day's habits were done. */
export interface HeatmapDay {
  date: DayKey;
  done: number;
  /** Habits that existed and were unarchived on that day. */
  total: number;
}

export interface HistoryMoment {
  date: DayKey;
  moment: string;
}

export interface HistoryResponse {
  month: MonthKey;
  /** Every day of the month, in order. Series arrays are parallel to this. */
  days: DayKey[];
  /** `null` = no data for that day. Never zero-filled. */
  series: Record<HistorySeriesKey, (number | null)[]>;
  heatmap: HeatmapDay[];
  moments: HistoryMoment[];
  /** Days after today, so the client can stop the axis at the present. */
  futureFrom: DayKey | null;
}

export async function getHistory(
  userId: string,
  month: MonthKey,
  now?: Date,
): Promise<HistoryResponse> {
  const timezone = await getUserTimezone(userId);
  const today = todayKey(timezone, now ?? new Date());
  const range = monthRange(month);
  const owner = new Types.ObjectId(userId);

  const [habitCounts, goalCounts, checkins, habits] = await Promise.all([
    // Habit ticks per day. Uses { userId, date }.
    HabitLog.aggregate<{ _id: DayKey; count: number }>([
      { $match: { userId: owner, date: { $gte: range.start, $lte: range.end } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ]),

    // Goals completed per day. Uses the new { userId, completedDate } index.
    Goal.aggregate<{ _id: DayKey; count: number }>([
      {
        $match: {
          userId: owner,
          status: "done",
          completedDate: { $gte: range.start, $lte: range.end },
        },
      },
      { $group: { _id: "$completedDate", count: { $sum: 1 } } },
    ]),

    Checkin.find({ userId: owner, date: { $gte: range.start, $lte: range.end } })
      .select("date mood energy sleepHours moment")
      .sort({ date: 1 })
      .lean(),

    // Needed for the heatmap denominator, including habits archived mid-month.
    Habit.find({ userId: owner }).select("createdAt archivedAt").lean(),
  ]);

  const habitsByDay = new Map(habitCounts.map((row) => [row._id, row.count]));
  const goalsByDay = new Map(goalCounts.map((row) => [row._id, row.count]));
  const checkinByDay = new Map(checkins.map((entry) => [entry.date, entry]));

  /**
   * How many habits existed on a given day.
   *
   * Computed per day rather than "however many exist now", so a habit added or
   * archived mid-month does not retroactively rewrite the density of days it was
   * never part of.
   */
  const activeOn = (date: DayKey): number =>
    habits.filter((habit) => {
      // Both instants become day keys in the USER's timezone, not UTC — a habit
      // created at 01:00 IST belongs to that IST day, not the previous UTC one.
      if (toDayKey(habit.createdAt, timezone) > date) return false;
      if (habit.archivedAt === null || habit.archivedAt === undefined) return true;
      return toDayKey(habit.archivedAt, timezone) > date;
    }).length;

  const series: Record<HistorySeriesKey, (number | null)[]> = {
    habits: [],
    sleep: [],
    tasks: [],
    mood: [],
    energy: [],
  };
  const heatmap: HeatmapDay[] = [];

  for (const date of range.days) {
    const checkin = checkinByDay.get(date);

    // A missing row is a gap, never a zero — see the note at the top.
    series.habits.push(habitsByDay.get(date) ?? null);
    series.tasks.push(goalsByDay.get(date) ?? null);
    series.sleep.push(checkin?.sleepHours ?? null);
    series.mood.push(checkin?.mood ?? null);
    series.energy.push(checkin?.energy ?? null);

    heatmap.push({ date, done: habitsByDay.get(date) ?? 0, total: activeOn(date) });
  }

  const moments: HistoryMoment[] = checkins
    .filter((entry): entry is typeof entry & { moment: string } => {
      return typeof entry.moment === "string" && entry.moment.trim() !== "";
    })
    .map((entry) => ({ date: entry.date, moment: entry.moment }));

  const firstFutureDay = range.days.find((date) => date > today);

  return {
    month,
    days: range.days,
    series,
    heatmap,
    moments,
    futureFrom: firstFutureDay ?? null,
  };
}

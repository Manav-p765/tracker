/**
 * Scan-and-enqueue (ARCHITECTURE.md §5).
 *
 * Every scanner is a **pure read** that returns the jobs that *should* be sent.
 * Nothing here touches Redis, which is deliberate: it makes the timezone and
 * idempotency rules — the two things most likely to be wrong — testable without
 * any queue infrastructure at all.
 *
 * Two invariants hold across all of them:
 *
 *  1. **Every time comparison happens in the user's own zone.** Never UTC, never
 *     the server's clock. A user at 21:00 IST is evaluated against 21:00 IST.
 *  2. **Every job carries a deterministic id** keyed on the thing and the day, so
 *     a scanner that runs twice inside one window produces the same id twice and
 *     BullMQ drops the second.
 *
 * We scan-and-enqueue rather than scheduling a cron per user: one repeatable job
 * that sweeps everyone is far less state to keep correct than N per-user schedules
 * that have to be created, updated and torn down as settings change.
 */

import {
  jobIds,
  todayKey,
  type DayKey,
  type ReminderKind,
} from "@tracker/shared";
import { Checkin, Goal, HabitLog, PushSubscription, User, type UserDoc } from "@tracker/db";

import { hitsWindow } from "./schedule.js";

export interface ReminderJob {
  /** Deterministic — the whole idempotency guarantee rests on this. */
  jobId: string;
  kind: ReminderKind;
  userId: string;
  day: DayKey;
  title: string;
  body: string;
  /** Deep link the notificationclick handler opens. */
  url: string;
}

/** How wide a slot each scan covers. Must be ≥ the scan interval or slots are missed. */
export const CHECKIN_WINDOW_MINUTES = 15;
export const GOAL_WINDOW_MINUTES = 30;
export const STREAK_WINDOW_MINUTES = 30;

/** Goal nudges land mid-morning local time, not at the evening reminder. */
export const GOAL_REMINDER_LOCAL_TIME = "09:00";
/** "Late in the user's day" — two hours before midnight. */
export const STREAK_REMINDER_LOCAL_TIME = "22:00";
/** Below this, a streak is not worth nagging anyone about. */
export const STREAK_MIN_DAYS = 2;

/**
 * Users who could receive anything at all.
 *
 * Filtering on "has at least one subscription" here means the scanners never
 * enqueue a job that would send nothing — no empty pushes, and no wasted queue
 * churn for accounts that never turned reminders on.
 */
async function candidates(toggle: keyof UserDoc): Promise<UserDoc[]> {
  const subscribed = await PushSubscription.distinct("userId");
  if (subscribed.length === 0) return [];

  return User.find({
    _id: { $in: subscribed },
    remindersEnabled: true,
    [toggle]: true,
  }).lean();
}

// ---------------------------------------------------------------------------
// 1 — evening check-in
// ---------------------------------------------------------------------------

/**
 * "Time for your evening check-in", at the user's own reminderTime, and only if
 * they have not already finished it.
 */
export async function scanCheckinReminders(now: Date): Promise<ReminderJob[]> {
  const users = await candidates("remindCheckin");
  const jobs: ReminderJob[] = [];

  for (const user of users) {
    const hit = hitsWindow(now, user.timezone, user.reminderTime, CHECKIN_WINDOW_MINUTES);
    if (hit === null) continue;

    // Already logged tonight → nothing to nudge about.
    const done = await Checkin.findOne({
      userId: user._id,
      date: hit.day,
      completed: true,
    })
      .select("_id")
      .lean();
    if (done !== null) continue;

    jobs.push({
      jobId: jobIds.checkinReminder(String(user._id), hit.day),
      kind: "checkin",
      userId: String(user._id),
      day: hit.day,
      title: "Evening check-in",
      body: "Time for your evening check-in.",
      url: "/checkin",
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// 2 — goal due today
// ---------------------------------------------------------------------------

/**
 * Goals due today — specific when there is one, a digest when there are several.
 *
 * **Threshold at two.** One goal gets the useful notification: its own title, and a
 * link straight to it. Two or more collapse into a single "N goals due today",
 * because a phone that buzzes five times in one morning trains you to swipe the app
 * away, and losing the reminder entirely costs more than losing the detail.
 *
 * The two paths are mutually exclusive — a digest replaces the per-goal nudges, it
 * does not accompany them.
 *
 * Idempotency survives the split because each path has its own deterministic key:
 * the single is per goal, the digest is per user per day. Re-scanning inside the
 * window regenerates the same id either way.
 */
export const GOAL_DIGEST_THRESHOLD = 2;

export async function scanGoalReminders(now: Date): Promise<ReminderJob[]> {
  const users = await candidates("remindGoals");
  const jobs: ReminderJob[] = [];

  for (const user of users) {
    const hit = hitsWindow(now, user.timezone, GOAL_REMINDER_LOCAL_TIME, GOAL_WINDOW_MINUTES);
    if (hit === null) continue;

    // `status: active` is what skips goals already done or archived.
    const due = await Goal.find({
      userId: user._id,
      status: "active",
      dueDate: hit.day,
    })
      .select("title horizon")
      .lean();

    if (due.length === 0) continue;

    if (due.length >= GOAL_DIGEST_THRESHOLD) {
      jobs.push({
        jobId: jobIds.goalDigest(String(user._id), hit.day),
        kind: "goal",
        userId: String(user._id),
        day: hit.day,
        title: "Due today",
        body: `${due.length} goals due today`,
        url: "/goals",
      });
      continue;
    }

    const goal = due[0];
    if (goal === undefined) continue;

    jobs.push({
      jobId: jobIds.goalReminder(String(goal._id), hit.day),
      kind: "goal",
      userId: String(user._id),
      day: hit.day,
      title: "Due today",
      body: goal.title,
      // Straight to the goal itself — detail lives under its horizon.
      url: `/goals/${goal.horizon}/${String(goal._id)}`,
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// 3 — streak at risk
// ---------------------------------------------------------------------------

/** The longest current habit run for a user, counted from today or yesterday. */
async function longestCurrentStreak(userId: string, today: DayKey): Promise<number> {
  const logs = await HabitLog.find({ userId }).select("habitId date").lean();
  if (logs.length === 0) return 0;

  const byHabit = new Map<string, Set<DayKey>>();
  for (const log of logs) {
    const key = String(log.habitId);
    const dates = byHabit.get(key) ?? new Set<DayKey>();
    dates.add(log.date);
    byHabit.set(key, dates);
  }

  const shiftDay = (day: DayKey, delta: number): DayKey => {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  };

  let best = 0;
  for (const dates of byHabit.values()) {
    // Same grace as the habits screen: an unlogged today does not break a run.
    let cursor = dates.has(today) ? today : shiftDay(today, -1);
    let run = 0;
    while (dates.has(cursor)) {
      run += 1;
      cursor = shiftDay(cursor, -1);
    }
    if (run > best) best = run;
  }
  return best;
}

/**
 * Late in the user's day, with today unlogged and a real run going.
 *
 * A separate job with its own toggle, so it can be silenced without losing the
 * evening reminder — this is the one most likely to feel like nagging.
 */
export async function scanStreakReminders(now: Date): Promise<ReminderJob[]> {
  const users = await candidates("remindStreak");
  const jobs: ReminderJob[] = [];

  for (const user of users) {
    const hit = hitsWindow(now, user.timezone, STREAK_REMINDER_LOCAL_TIME, STREAK_WINDOW_MINUTES);
    if (hit === null) continue;

    const done = await Checkin.findOne({ userId: user._id, date: hit.day, completed: true })
      .select("_id")
      .lean();
    if (done !== null) continue;

    const streak = await longestCurrentStreak(String(user._id), hit.day);
    if (streak < STREAK_MIN_DAYS) continue;

    jobs.push({
      jobId: jobIds.streakReminder(String(user._id), hit.day),
      kind: "streak",
      userId: String(user._id),
      day: hit.day,
      title: "Streak at risk",
      body: `${streak} days going — tonight's check-in keeps it.`,
      url: "/checkin",
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// 4 — events (Phase 3.3)
// ---------------------------------------------------------------------------

/**
 * Deliberately inert.
 *
 * The events collection exists but nothing writes to it until Phase 3.3, so this
 * returns nothing rather than querying a table that is always empty. The job, the
 * queue wiring and the `event` reminder kind are all in place, so 3.3 only has to
 * fill in the body of this function.
 */
export async function scanEventReminders(_now: Date): Promise<ReminderJob[]> {
  return [];
}

/** Every scanner, in the order the worker runs them. */
export const SCANNERS = {
  checkin: scanCheckinReminders,
  goal: scanGoalReminders,
  streak: scanStreakReminders,
  event: scanEventReminders,
} as const;

/** Today in a user's zone — exported for the manual trigger script. */
export const userToday = (user: Pick<UserDoc, "timezone">, now: Date): DayKey =>
  todayKey(user.timezone, now);

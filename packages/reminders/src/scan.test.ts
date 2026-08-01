import { Checkin, Goal, Habit, HabitLog, PushSubscription, User } from "@tracker/db";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";

import {
  scanCheckinReminders,
  scanEventReminders,
  scanGoalReminders,
  scanStreakReminders,
} from "./scan.js";

/**
 * 15:30 UTC is exactly 21:00 in Asia/Kolkata — the reminder moment for an IST user
 * whose reminderTime is the default 21:00.
 */
const AT_2100_IST = new Date("2026-07-27T15:30:00.000Z");
/** The same wall-clock hour in UTC, which for an IST user is 02:30 the next day. */
const AT_2100_UTC = new Date("2026-07-27T21:00:00.000Z");
const TODAY_IST = "2026-07-27";

interface MakeUser {
  timezone?: string;
  reminderTime?: string;
  remindersEnabled?: boolean;
  remindCheckin?: boolean;
  remindGoals?: boolean;
  remindStreak?: boolean;
  withDevice?: boolean;
}

let seq = 0;

async function makeUser(options: MakeUser = {}): Promise<string> {
  seq += 1;
  const user = await User.create({
    email: `worker-${seq}@tracker.local`,
    passwordHash: "x".repeat(40),
    timezone: options.timezone ?? "Asia/Kolkata",
    reminderTime: options.reminderTime ?? "21:00",
    remindersEnabled: options.remindersEnabled ?? true,
    remindCheckin: options.remindCheckin ?? true,
    remindGoals: options.remindGoals ?? true,
    remindStreak: options.remindStreak ?? true,
  });

  // Without a device there is nothing to send to, so most tests need one.
  if (options.withDevice !== false) {
    await PushSubscription.create({
      userId: user._id,
      endpoint: `https://fcm.googleapis.com/fcm/send/device-${seq}`,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });
  }

  return String(user._id);
}

beforeEach(() => {
  seq = 0;
});

describe("check-in reminder — timezone correctness", () => {
  it("FIRES for an IST user when it is 21:00 for THEM", async () => {
    const userId = await makeUser();
    const jobs = await scanCheckinReminders(AT_2100_IST);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      userId,
      kind: "checkin",
      day: TODAY_IST,
      url: "/checkin",
      jobId: `checkin-reminder:${userId}:${TODAY_IST}`,
    });
  });

  it("does NOT fire for that IST user at 21:00 UTC", async () => {
    await makeUser();
    // The regression this whole module exists to prevent.
    expect(await scanCheckinReminders(AT_2100_UTC)).toEqual([]);
  });

  it("fires for a UTC user at 21:00 UTC instead", async () => {
    await makeUser({ timezone: "UTC" });
    expect(await scanCheckinReminders(AT_2100_UTC)).toHaveLength(1);
    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });

  it("sorts two users in different zones into their own moments", async () => {
    const ist = await makeUser({ timezone: "Asia/Kolkata" });
    const utc = await makeUser({ timezone: "UTC" });

    const atIst = await scanCheckinReminders(AT_2100_IST);
    const atUtc = await scanCheckinReminders(AT_2100_UTC);

    expect(atIst.map((job) => job.userId)).toEqual([ist]);
    expect(atUtc.map((job) => job.userId)).toEqual([utc]);
  });

  it("respects a non-default reminder time", async () => {
    await makeUser({ reminderTime: "06:30" });
    // 01:00 UTC === 06:30 IST.
    expect(await scanCheckinReminders(new Date("2026-07-27T01:00:00.000Z"))).toHaveLength(1);
    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });
});

describe("check-in reminder — idempotency", () => {
  it("yields the SAME jobId when the same window is scanned twice", async () => {
    const userId = await makeUser();

    const first = await scanCheckinReminders(AT_2100_IST);
    // Four minutes later, still inside the 15-minute window.
    const second = await scanCheckinReminders(new Date("2026-07-27T15:34:00.000Z"));

    expect(first[0]?.jobId).toBe(second[0]?.jobId);
    expect(first[0]?.jobId).toBe(`checkin-reminder:${userId}:${TODAY_IST}`);
    // BullMQ drops the duplicate on jobId, so this is one notification.
    expect(new Set([first[0]?.jobId, second[0]?.jobId]).size).toBe(1);
  });

  it("yields a DIFFERENT jobId on the next day", async () => {
    await makeUser();
    const today = await scanCheckinReminders(AT_2100_IST);
    const tomorrow = await scanCheckinReminders(new Date("2026-07-28T15:30:00.000Z"));

    expect(today[0]?.jobId).not.toBe(tomorrow[0]?.jobId);
    expect(tomorrow[0]?.day).toBe("2026-07-28");
  });

  it("keeps one jobId across midnight for a late reminder", async () => {
    await makeUser({ reminderTime: "23:58" });
    // 18:28 UTC === 23:58 IST; 18:31 UTC === 00:01 IST the next day.
    const before = await scanCheckinReminders(new Date("2026-07-27T18:28:00.000Z"));
    const after = await scanCheckinReminders(new Date("2026-07-27T18:31:00.000Z"));

    expect(before[0]?.jobId).toBe(after[0]?.jobId);
  });
});

describe("check-in reminder — skip when already done", () => {
  it("skips a user who has completed today's check-in", async () => {
    const userId = await makeUser();
    await Checkin.create({
      userId: new Types.ObjectId(userId),
      date: TODAY_IST,
      completed: true,
    });

    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });

  it("still fires when the check-in exists but is NOT finished", async () => {
    const userId = await makeUser();
    // Logged a mood at lunchtime, never finished the evening flow.
    await Checkin.create({
      userId: new Types.ObjectId(userId),
      date: TODAY_IST,
      mood: 3,
      completed: false,
    });

    expect(await scanCheckinReminders(AT_2100_IST)).toHaveLength(1);
  });

  it("is not fooled by yesterday's completed check-in", async () => {
    const userId = await makeUser();
    await Checkin.create({
      userId: new Types.ObjectId(userId),
      date: "2026-07-26",
      completed: true,
    });

    expect(await scanCheckinReminders(AT_2100_IST)).toHaveLength(1);
  });
});

describe("check-in reminder — respects intent", () => {
  it("skips a user with no device", async () => {
    await makeUser({ withDevice: false });
    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });

  it("skips a user with reminders switched off entirely", async () => {
    await makeUser({ remindersEnabled: false });
    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });

  it("skips a user who turned the check-in reminder off", async () => {
    await makeUser({ remindCheckin: false });
    expect(await scanCheckinReminders(AT_2100_IST)).toEqual([]);
  });
});

describe("goal due reminder", () => {
  /** 03:30 UTC === 09:00 IST, the goal reminder slot. */
  const AT_0900_IST = new Date("2026-07-27T03:30:00.000Z");

  async function makeGoal(
    userId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const goal = await Goal.create({
      userId: new Types.ObjectId(userId),
      title: "Finish the notes",
      horizon: "daily",
      status: "active",
      dueDate: TODAY_IST,
      currentValue: 0,
      sortOrder: 0,
      ...overrides,
    });
    return String(goal._id);
  }

  it("ONE goal due → the specific notification, linked to that goal", async () => {
    const userId = await makeUser();
    const goalId = await makeGoal(userId);

    const jobs = await scanGoalReminders(AT_0900_IST);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "goal",
      userId,
      body: "Finish the notes",
      jobId: `goal-reminder:${goalId}:${TODAY_IST}`,
      // Straight to the goal, not to the list.
      url: `/goals/daily/${goalId}`,
    });
  });

  it("THREE goals due → exactly ONE digest, not three notifications", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { title: "First" });
    await makeGoal(userId, { title: "Second" });
    await makeGoal(userId, { title: "Third" });

    const jobs = await scanGoalReminders(AT_0900_IST);

    // The point of the threshold: one buzz, not three.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "goal",
      userId,
      body: "3 goals due today",
      jobId: `goal-digest:${userId}:${TODAY_IST}`,
      url: "/goals",
    });
    // And emphatically NOT the per-goal ids.
    expect(jobs[0]?.jobId.startsWith("goal-reminder:")).toBe(false);
  });

  it("TWO goals due → already a digest (the threshold is two)", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { title: "First" });
    await makeGoal(userId, { title: "Second" });

    const jobs = await scanGoalReminders(AT_0900_IST);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.body).toBe("2 goals due today");
  });

  it("the digest jobId is stable across two scans in the same window", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { title: "First" });
    await makeGoal(userId, { title: "Second" });

    const first = await scanGoalReminders(AT_0900_IST);
    // 15 minutes later, still inside the 30-minute window.
    const second = await scanGoalReminders(new Date("2026-07-27T03:45:00.000Z"));

    expect(first[0]?.jobId).toBe(second[0]?.jobId);
    // BullMQ drops the duplicate on jobId → one notification, not two.
    expect(new Set([first[0]?.jobId, second[0]?.jobId]).size).toBe(1);
  });

  it("the digest jobId changes when the day rolls over", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { title: "First" });
    await makeGoal(userId, { title: "Second" });
    // Tomorrow's goals, due tomorrow.
    await makeGoal(userId, { title: "Third", dueDate: "2026-07-28" });
    await makeGoal(userId, { title: "Fourth", dueDate: "2026-07-28" });

    const today = await scanGoalReminders(AT_0900_IST);
    const tomorrow = await scanGoalReminders(new Date("2026-07-28T03:30:00.000Z"));

    expect(today[0]?.jobId).toBe(`goal-digest:${userId}:${TODAY_IST}`);
    expect(tomorrow[0]?.jobId).toBe(`goal-digest:${userId}:2026-07-28`);
    expect(today[0]?.jobId).not.toBe(tomorrow[0]?.jobId);
  });

  it("digests per user, never across users", async () => {
    const first = await makeUser();
    const second = await makeUser();
    await makeGoal(first, { title: "Mine A" });
    await makeGoal(first, { title: "Mine B" });
    await makeGoal(second, { title: "Theirs" });

    const jobs = await scanGoalReminders(AT_0900_IST);

    expect(jobs).toHaveLength(2);
    // One digest for the user with two, one specific for the user with one.
    expect(jobs.find((job) => job.userId === first)?.jobId).toBe(
      `goal-digest:${first}:${TODAY_IST}`,
    );
    expect(jobs.find((job) => job.userId === second)?.jobId).toMatch(/^goal-reminder:/);
  });

  it("counts only the goals that would have been notified", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { title: "Open" });
    // Neither of these should reach the count — or trip the threshold.
    await makeGoal(userId, { title: "Done", status: "done", completedDate: TODAY_IST });
    await makeGoal(userId, { title: "Archived", status: "archived" });

    const jobs = await scanGoalReminders(AT_0900_IST);
    // One eligible goal → specific notification, not a "3 goals due" digest.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.body).toBe("Open");
    expect(jobs[0]?.jobId).toMatch(/^goal-reminder:/);
  });

  it("skips a goal already completed", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { status: "done", completedDate: TODAY_IST });
    expect(await scanGoalReminders(AT_0900_IST)).toEqual([]);
  });

  it("skips an archived goal", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { status: "archived" });
    expect(await scanGoalReminders(AT_0900_IST)).toEqual([]);
  });

  it("skips a goal due on another day", async () => {
    const userId = await makeUser();
    await makeGoal(userId, { dueDate: "2026-07-28" });
    expect(await scanGoalReminders(AT_0900_IST)).toEqual([]);
  });

  it("evaluates 'due today' in the user's zone", async () => {
    // For a UTC user, 03:30 UTC is 03:30 — not their 09:00 slot.
    const utcUser = await makeUser({ timezone: "UTC" });
    await makeGoal(utcUser);
    expect(await scanGoalReminders(AT_0900_IST)).toEqual([]);
    // Their slot is 09:00 UTC.
    expect(await scanGoalReminders(new Date("2026-07-27T09:00:00.000Z"))).toHaveLength(1);
  });

  it("the single-goal jobId is idempotent within the window", async () => {
    const userId = await makeUser();
    await makeGoal(userId);
    const first = await scanGoalReminders(AT_0900_IST);
    const second = await scanGoalReminders(new Date("2026-07-27T03:45:00.000Z"));
    expect(first[0]?.jobId).toBe(second[0]?.jobId);
  });

  it("respects the goal toggle", async () => {
    const userId = await makeUser({ remindGoals: false });
    await makeGoal(userId);
    expect(await scanGoalReminders(AT_0900_IST)).toEqual([]);
  });
});

describe("streak-at-risk reminder", () => {
  /** 16:30 UTC === 22:00 IST, late in the user's day. */
  const AT_2200_IST = new Date("2026-07-27T16:30:00.000Z");

  async function makeStreak(userId: string, days: number): Promise<void> {
    const habit = await Habit.create({
      userId: new Types.ObjectId(userId),
      name: "Read",
      pastel: "sage",
      pixelGlyph: "book",
      sortOrder: 0,
    });
    for (let back = 0; back < days; back += 1) {
      const date = new Date(`${TODAY_IST}T00:00:00.000Z`);
      // Build the run ending YESTERDAY, since today is what is at risk.
      date.setUTCDate(date.getUTCDate() - 1 - back);
      await HabitLog.create({
        userId: new Types.ObjectId(userId),
        habitId: habit._id,
        date: date.toISOString().slice(0, 10),
        done: true,
      });
    }
  }

  it("fires late in the day with a real streak and no check-in", async () => {
    const userId = await makeUser();
    await makeStreak(userId, 5);

    const jobs = await scanStreakReminders(AT_2200_IST);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "streak",
      userId,
      jobId: `streak-risk:${userId}:${TODAY_IST}`,
    });
    expect(jobs[0]?.body).toContain("5 days");
  });

  it("does not fire earlier in the day", async () => {
    const userId = await makeUser();
    await makeStreak(userId, 5);
    expect(await scanStreakReminders(AT_2100_IST)).toEqual([]);
  });

  it("does not fire once the check-in is done", async () => {
    const userId = await makeUser();
    await makeStreak(userId, 5);
    await Checkin.create({
      userId: new Types.ObjectId(userId),
      date: TODAY_IST,
      completed: true,
    });
    expect(await scanStreakReminders(AT_2200_IST)).toEqual([]);
  });

  it("does not nag about a one-day streak", async () => {
    const userId = await makeUser();
    await makeStreak(userId, 1);
    expect(await scanStreakReminders(AT_2200_IST)).toEqual([]);
  });

  it("does not fire with no habits at all", async () => {
    await makeUser();
    expect(await scanStreakReminders(AT_2200_IST)).toEqual([]);
  });

  it("can be switched off on its own, leaving the check-in reminder alone", async () => {
    const userId = await makeUser({ remindStreak: false });
    await makeStreak(userId, 5);

    expect(await scanStreakReminders(AT_2200_IST)).toEqual([]);
    // The evening reminder is a separate toggle and still works.
    expect(await scanCheckinReminders(AT_2100_IST)).toHaveLength(1);
  });
});

describe("event reminder", () => {
  it("is inert until Phase 3.3", async () => {
    await makeUser();
    expect(await scanEventReminders(AT_2100_IST)).toEqual([]);
  });
});

import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";

import { Habit, User } from "@tracker/db";
import { hashPassword } from "./auth.service.js";
import { upsertCheckin } from "./checkin.service.js";
import { createGoal, setGoalCompleted } from "./goal.service.js";
import { createHabit, setHabitLog } from "./habit.service.js";
import { getHistory } from "./history.service.js";

const EVENING_UTC = new Date("2026-07-26T18:30:00.000Z");
const TODAY = "2026-07-27"; // in IST
const MONTH = "2026-07";

let userId: string;
let otherId: string;

async function makeUser(email: string, timezone = "Asia/Kolkata"): Promise<string> {
  const user = await User.create({
    email,
    passwordHash: await hashPassword("a-long-enough-password"),
    timezone,
  });
  return String(user._id);
}

beforeEach(async () => {
  userId = await makeUser("history@tracker.local");
  otherId = await makeUser("other-history@tracker.local");
});

/** Index of a day within the month's parallel series arrays. */
const at = (date: string): number => Number(date.slice(8, 10)) - 1;

/**
 * Creates a habit that already existed on `since`.
 *
 * The heatmap denominator counts habits that existed on each day, so a habit
 * created at the test process's wall clock would count for no day in a fixed test
 * month — and the test would pass or fail depending on when it ran. Anchor it.
 */
async function habitSince(name: string, since: string, owner = userId): Promise<string> {
  const habit = await createHabit(owner, { name });
  await Habit.collection.updateOne(
    { _id: new Types.ObjectId(habit._id) },
    { $set: { createdAt: new Date(`${since}T00:00:00.000Z`) } },
  );
  return habit._id;
}

describe("honest gaps", () => {
  it("gives every day of the month a slot", async () => {
    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.days).toHaveLength(31);
    for (const key of ["habits", "sleep", "tasks", "mood", "energy"] as const) {
      expect(history.series[key]).toHaveLength(31);
    }
  });

  it("uses null, never zero, for a day with no rows", async () => {
    const history = await getHistory(userId, MONTH, EVENING_UTC);
    // A month with nothing logged is all gaps — not a flat line along the axis.
    expect(history.series.habits.every((value) => value === null)).toBe(true);
    expect(history.series.sleep.every((value) => value === null)).toBe(true);
    expect(history.series.tasks.every((value) => value === null)).toBe(true);
  });

  it("leaves the days between two logged days as gaps", async () => {
    const habit = await createHabit(userId, { name: "Read" });
    await setHabitLog(userId, { habitId: habit._id, date: "2026-07-20", done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: habit._id, date: "2026-07-24", done: true }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.habits[at("2026-07-20")]).toBe(1);
    expect(history.series.habits[at("2026-07-21")]).toBeNull();
    expect(history.series.habits[at("2026-07-22")]).toBeNull();
    expect(history.series.habits[at("2026-07-24")]).toBe(1);
  });

  it("does not turn an un-ticked habit into a zero", async () => {
    const habit = await createHabit(userId, { name: "Read" });
    await setHabitLog(userId, { habitId: habit._id, date: "2026-07-20", done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: habit._id, date: "2026-07-20", done: false }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    // Un-ticking deletes the row, so the day is indistinguishable from unlogged.
    expect(history.series.habits[at("2026-07-20")]).toBeNull();
  });

  it("keeps sleep of zero distinct from unlogged sleep", async () => {
    await upsertCheckin(userId, { date: "2026-07-20", sleepHours: 0 }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    // A logged 0 is real data; the day beside it is a gap.
    expect(history.series.sleep[at("2026-07-20")]).toBe(0);
    expect(history.series.sleep[at("2026-07-21")]).toBeNull();
  });
});

describe("series", () => {
  it("counts habit ticks per day", async () => {
    const read = await createHabit(userId, { name: "Read" });
    const walk = await createHabit(userId, { name: "Walk" });
    await setHabitLog(userId, { habitId: read._id, date: "2026-07-20", done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: walk._id, date: "2026-07-20", done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: read._id, date: "2026-07-21", done: true }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.habits[at("2026-07-20")]).toBe(2);
    expect(history.series.habits[at("2026-07-21")]).toBe(1);
  });

  it("counts goals completed per day, by completion date not creation", async () => {
    const goal = await createGoal(
      userId,
      { title: "Walk", horizon: "daily" } as never,
      EVENING_UTC,
    );
    await setGoalCompleted(userId, goal._id, true, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.tasks[at(TODAY)]).toBe(1);
  });

  it("does not count an un-completed goal", async () => {
    const goal = await createGoal(
      userId,
      { title: "Walk", horizon: "daily" } as never,
      EVENING_UTC,
    );
    await setGoalCompleted(userId, goal._id, true, EVENING_UTC);
    await setGoalCompleted(userId, goal._id, false, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.tasks[at(TODAY)]).toBeNull();
  });

  it("reads mood, energy and sleep from the check-in", async () => {
    await upsertCheckin(
      userId,
      { date: "2026-07-22", mood: 4, energy: 2, sleepHours: 7.5 },
      EVENING_UTC,
    );

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.mood[at("2026-07-22")]).toBe(4);
    expect(history.series.energy[at("2026-07-22")]).toBe(2);
    expect(history.series.sleep[at("2026-07-22")]).toBe(7.5);
  });

  it("leaves the fields a partial check-in omitted as gaps", async () => {
    await upsertCheckin(userId, { date: "2026-07-22", mood: 4 }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.mood[at("2026-07-22")]).toBe(4);
    expect(history.series.sleep[at("2026-07-22")]).toBeNull();
    expect(history.series.energy[at("2026-07-22")]).toBeNull();
  });

  it("excludes days outside the month", async () => {
    const habit = await createHabit(userId, { name: "Read" });
    await setHabitLog(userId, { habitId: habit._id, date: "2026-06-30", done: true }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.habits.every((value) => value === null)).toBe(true);
  });

  it("never mixes in another user's data", async () => {
    const theirs = await createHabit(otherId, { name: "Read" });
    await setHabitLog(otherId, { habitId: theirs._id, date: "2026-07-20", done: true }, EVENING_UTC);
    await upsertCheckin(otherId, { date: "2026-07-20", mood: 5 }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.series.habits[at("2026-07-20")]).toBeNull();
    expect(history.series.mood[at("2026-07-20")]).toBeNull();
  });
});

describe("heatmap density", () => {
  it("reports done over the habits active that day", async () => {
    const read = await habitSince("Read", "2026-07-01");
    await habitSince("Walk", "2026-07-01");
    await habitSince("Water", "2026-07-01");
    await setHabitLog(userId, { habitId: read, date: "2026-07-20", done: true }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.heatmap[at("2026-07-20")]).toEqual({
      date: "2026-07-20",
      done: 1,
      total: 3,
    });
  });

  it("uses zero done — empty paper — rather than a gap", async () => {
    await habitSince("Read", "2026-07-01");
    const history = await getHistory(userId, MONTH, EVENING_UTC);
    // The heatmap is the one place 0 is drawable: it renders as blank paper.
    expect(history.heatmap[at("2026-07-20")]?.done).toBe(0);
  });

  it("does not count a habit against days before it existed", async () => {
    await habitSince("Read", "2026-07-25");

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.heatmap[at("2026-07-24")]?.total).toBe(0);
    expect(history.heatmap[at("2026-07-26")]?.total).toBe(1);
  });

  it("drops an archived habit from the days after it was archived", async () => {
    const habit = await habitSince("Read", "2026-07-01");
    await Habit.collection.updateOne(
      { _id: new Types.ObjectId(habit) },
      { $set: { archivedAt: new Date("2026-07-15T00:00:00.000Z") } },
    );

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.heatmap[at("2026-07-10")]?.total).toBe(1);
    expect(history.heatmap[at("2026-07-20")]?.total).toBe(0);
  });
});

describe("moments", () => {
  it("lists non-empty moments with their dates, oldest first", async () => {
    await upsertCheckin(userId, { date: "2026-07-22", moment: "Second" }, EVENING_UTC);
    await upsertCheckin(userId, { date: "2026-07-20", moment: "First" }, EVENING_UTC);
    await upsertCheckin(userId, { date: "2026-07-23", mood: 3 }, EVENING_UTC);

    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.moments).toEqual([
      { date: "2026-07-20", moment: "First" },
      { date: "2026-07-22", moment: "Second" },
    ]);
  });

  it("skips a check-in with no moment", async () => {
    await upsertCheckin(userId, { date: "2026-07-20", mood: 3 }, EVENING_UTC);
    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.moments).toEqual([]);
  });
});

describe("future days", () => {
  it("marks where the future starts so the axis can stop at today", async () => {
    const history = await getHistory(userId, MONTH, EVENING_UTC);
    expect(history.futureFrom).toBe("2026-07-28"); // today is the 27th in IST
  });

  it("reports no future for a month already past", async () => {
    const history = await getHistory(userId, "2026-06", EVENING_UTC);
    expect(history.futureFrom).toBeNull();
  });
});

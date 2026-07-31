import type { Habit as HabitDto } from "@tracker/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { HabitLog, User } from "@tracker/db";
import { hashPassword } from "./auth.service.js";
import {
  createHabit,
  habitGrid,
  habitHeatmap,
  habitStreak,
  listHabits,
  setHabitArchived,
  setHabitLog,
  updateHabit,
} from "./habit.service.js";

/** 18:30 UTC is already the next day in Asia/Kolkata (+05:30). */
const EVENING_UTC = new Date("2026-07-26T18:30:00.000Z");
const TODAY = "2026-07-27"; // in IST
const YESTERDAY = "2026-07-26";

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
  userId = await makeUser("habits@tracker.local");
  otherId = await makeUser("other-habits@tracker.local");
});

const add = (name: string, owner = userId): Promise<HabitDto> =>
  createHabit(owner, { name });

/** Ticks a run of days, oldest first. */
async function tick(habitId: string, dates: readonly string[], owner = userId): Promise<void> {
  for (const date of dates) {
    await setHabitLog(owner, { habitId, date, done: true }, EVENING_UTC);
  }
}

describe("habit CRUD", () => {
  it("appends new habits to the bottom of the grid", async () => {
    const first = await add("Read");
    const second = await add("Water");
    const third = await add("Walk");
    expect([first.sortOrder, second.sortOrder, third.sortOrder]).toEqual([0, 1, 2]);
  });

  it("defaults to the sage pastel and the X glyph", async () => {
    const habit = await add("Read");
    expect(habit.pastel).toBe("sage");
    expect(habit.pixelGlyph).toBe("x");
  });

  it("renames, recolours and re-glyphs", async () => {
    const habit = await add("Read");
    const patched = await updateHabit(userId, habit._id, {
      name: "Read a chapter",
      pastel: "powder",
      pixelGlyph: "book",
    });
    expect(patched.name).toBe("Read a chapter");
    expect(patched.pastel).toBe("powder");
    expect(patched.pixelGlyph).toBe("book");
  });

  it("clears a weekly target with null", async () => {
    const habit = await add("Read");
    await updateHabit(userId, habit._id, { targetPerWeek: 5 });
    const cleared = await updateHabit(userId, habit._id, { targetPerWeek: null });
    expect(cleared.targetPerWeek).toBeUndefined();
  });

  it("refuses to touch another user's habit", async () => {
    const mine = await add("Read");
    await expect(updateHabit(otherId, mine._id, { name: "Theirs" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(setHabitArchived(otherId, mine._id, true)).rejects.toMatchObject({ status: 404 });
  });
});

describe("archiving", () => {
  it("drops the habit from the list but keeps every log", async () => {
    const habit = await add("Read");
    await tick(habit._id, [YESTERDAY, TODAY]);

    await setHabitArchived(userId, habit._id, true);

    expect(await listHabits(userId)).toHaveLength(0);
    expect(await listHabits(userId, true)).toHaveLength(1);
    // The history is the point: archiving is not deleting.
    expect(await HabitLog.countDocuments({ userId, habitId: habit._id })).toBe(2);
  });

  it("removes an archived habit from today's grid", async () => {
    const kept = await add("Read");
    const archived = await add("Water");
    await setHabitArchived(userId, archived._id, true);

    const rows = await habitGrid(userId, YESTERDAY, TODAY);
    expect(rows.map((row) => row.habit._id)).toEqual([kept._id]);
  });

  it("restores without losing anything", async () => {
    const habit = await add("Read");
    await tick(habit._id, [TODAY]);
    await setHabitArchived(userId, habit._id, true);
    const restored = await setHabitArchived(userId, habit._id, false);

    expect(restored.archivedAt).toBeNull();
    expect(await listHabits(userId)).toHaveLength(1);
    expect((await habitStreak(userId, habit._id, EVENING_UTC)).current).toBe(1);
  });
});

describe("logging", () => {
  it("is idempotent — a double tap writes one row", async () => {
    const habit = await add("Read");
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: true }, EVENING_UTC);

    expect(await HabitLog.countDocuments({ userId, habitId: habit._id, date: TODAY })).toBe(1);
  });

  it("un-ticking deletes the row rather than storing a negative", async () => {
    const habit = await add("Read");
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: true }, EVENING_UTC);
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: false }, EVENING_UTC);

    expect(await HabitLog.countDocuments({ userId, habitId: habit._id })).toBe(0);
  });

  it("un-ticking a day that was never ticked is harmless", async () => {
    const habit = await add("Read");
    await expect(
      setHabitLog(userId, { habitId: habit._id, date: TODAY, done: false }, EVENING_UTC),
    ).resolves.toMatchObject({ done: false });
  });

  it("allows backfilling a past day", async () => {
    const habit = await add("Read");
    const result = await setHabitLog(
      userId,
      { habitId: habit._id, date: "2026-07-01", done: true },
      EVENING_UTC,
    );
    expect(result.done).toBe(true);
  });

  it("refuses a future day, in the user's timezone", async () => {
    const habit = await add("Read");
    // 2026-07-28 is tomorrow for this IST user at EVENING_UTC.
    await expect(
      setHabitLog(userId, { habitId: habit._id, date: "2026-07-28", done: true }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("lets a UTC user log a day their IST neighbour cannot", async () => {
    // At EVENING_UTC it is the 27th in IST but still the 26th in UTC, so the 27th
    // is today for one and tomorrow for the other.
    const utcUser = await makeUser("utc-habits@tracker.local", "UTC");
    const theirs = await add("Read", utcUser);

    await expect(
      setHabitLog(utcUser, { habitId: theirs._id, date: "2026-07-27", done: true }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });

    const mine = await add("Read");
    await expect(
      setHabitLog(userId, { habitId: mine._id, date: "2026-07-27", done: true }, EVENING_UTC),
    ).resolves.toMatchObject({ done: true });
  });

  it("refuses to log against another user's habit", async () => {
    const mine = await add("Read");
    await expect(
      setHabitLog(otherId, { habitId: mine._id, date: TODAY, done: true }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("grid", () => {
  it("returns a row per habit with only the days in range", async () => {
    const read = await add("Read");
    const water = await add("Water");
    await tick(read._id, ["2026-07-24", "2026-07-25", TODAY]);
    await tick(water._id, [TODAY]);
    // Outside the window.
    await tick(read._id, ["2026-07-01"]);

    const rows = await habitGrid(userId, "2026-07-24", TODAY);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.habit.name).toBe("Read");
    expect(Object.keys(rows[0]?.days ?? {}).sort()).toEqual([
      "2026-07-24",
      "2026-07-25",
      TODAY,
    ]);
    expect(rows[1]?.days).toEqual({ [TODAY]: true });
  });

  it("gives an untouched habit an empty day map, not a missing row", async () => {
    await add("Read");
    const rows = await habitGrid(userId, YESTERDAY, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.days).toEqual({});
  });

  it("never leaks another user's logs into the grid", async () => {
    const mine = await add("Read");
    const theirs = await add("Read", otherId);
    await tick(theirs._id, [TODAY], otherId);

    const rows = await habitGrid(userId, YESTERDAY, TODAY);
    expect(rows.map((row) => row.habit._id)).toEqual([mine._id]);
    expect(rows[0]?.days).toEqual({});
  });

  it("keeps habits in grid order", async () => {
    const first = await add("Read");
    const second = await add("Water");
    await updateHabit(userId, first._id, { sortOrder: 5 });

    const rows = await habitGrid(userId, YESTERDAY, TODAY);
    expect(rows.map((row) => row.habit._id)).toEqual([second._id, first._id]);
  });
});

describe("streak", () => {
  it("is zero with no logs at all", async () => {
    const habit = await add("Read");
    expect(await habitStreak(userId, habit._id, EVENING_UTC)).toEqual({ current: 0, longest: 0 });
  });

  it("counts a single day as one", async () => {
    const habit = await add("Read");
    await tick(habit._id, [TODAY]);
    expect(await habitStreak(userId, habit._id, EVENING_UTC)).toEqual({ current: 1, longest: 1 });
  });

  it("counts a run that includes today", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-25", "2026-07-26", TODAY]);
    expect((await habitStreak(userId, habit._id, EVENING_UTC)).current).toBe(3);
  });

  /**
   * The judgement call, pinned: an unlogged today does not break the run. Someone
   * who logs every evening should not see 0 all morning.
   */
  it("keeps a run alive that ended yesterday, with today not yet logged", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-24", "2026-07-25", YESTERDAY]);
    expect((await habitStreak(userId, habit._id, EVENING_UTC)).current).toBe(3);
  });

  it("ends the run after two clear days", async () => {
    const habit = await add("Read");
    // Nothing on the 26th or the 27th.
    await tick(habit._id, ["2026-07-23", "2026-07-24", "2026-07-25"]);
    const streak = await habitStreak(userId, habit._id, EVENING_UTC);
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(3);
  });

  it("reports the longest run from history, not the current one", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]); // 4
    await tick(habit._id, [YESTERDAY, TODAY]); // 2, current
    const streak = await habitStreak(userId, habit._id, EVENING_UTC);
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(4);
  });

  it("does not join runs across a gap", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-10", "2026-07-11", "2026-07-13", "2026-07-14"]);
    expect((await habitStreak(userId, habit._id, EVENING_UTC)).longest).toBe(2);
  });

  it("counts a run that spans a month boundary", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-06-29", "2026-06-30", "2026-07-01"]);
    expect((await habitStreak(userId, habit._id, EVENING_UTC)).longest).toBe(3);
  });

  it("drops to zero once un-ticked", async () => {
    const habit = await add("Read");
    await tick(habit._id, [TODAY]);
    await setHabitLog(userId, { habitId: habit._id, date: TODAY, done: false }, EVENING_UTC);
    expect(await habitStreak(userId, habit._id, EVENING_UTC)).toEqual({ current: 0, longest: 0 });
  });

  it("is measured in the user's timezone, not the server's", async () => {
    // Ticking "today" for an IST user is the 27th; for a UTC user today is the 26th,
    // so the same date is tomorrow and the run has to be built a day earlier.
    const utcUser = await makeUser("utc-streak@tracker.local", "UTC");
    const theirs = await add("Read", utcUser);
    await tick(theirs._id, [YESTERDAY], utcUser);

    expect((await habitStreak(utcUser, theirs._id, EVENING_UTC)).current).toBe(1);
  });
});

describe("heatmap", () => {
  it("returns every day of the month, flagging the future", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-02", "2026-07-03"]);

    const heatmap = await habitHeatmap(userId, habit._id, "2026-07", EVENING_UTC);

    expect(heatmap.days).toHaveLength(31);
    expect(heatmap.days.filter((day) => day.done).map((day) => day.date)).toEqual([
      "2026-07-02",
      "2026-07-03",
    ]);
    // Today is the 27th, so the 28th onwards is still to come.
    expect(heatmap.days.filter((day) => day.future)).toHaveLength(4);
    expect(heatmap.elapsed).toBe(27);
    expect(heatmap.completed).toBe(2);
  });

  it("agrees with the streak about which days are ticked", async () => {
    const habit = await add("Read");
    await tick(habit._id, ["2026-07-25", YESTERDAY, TODAY]);

    const heatmap = await habitHeatmap(userId, habit._id, "2026-07", EVENING_UTC);
    const streak = await habitStreak(userId, habit._id, EVENING_UTC);

    const doneDates = heatmap.days.filter((day) => day.done).map((day) => day.date);
    expect(doneDates).toEqual(["2026-07-25", YESTERDAY, TODAY]);
    expect(streak.current).toBe(doneDates.length);
  });

  it("handles a month with no logs", async () => {
    const habit = await add("Read");
    const heatmap = await habitHeatmap(userId, habit._id, "2026-02", EVENING_UTC);
    expect(heatmap.days).toHaveLength(28);
    expect(heatmap.completed).toBe(0);
  });

  it("refuses another user's habit", async () => {
    const mine = await add("Read");
    await expect(habitHeatmap(otherId, mine._id, "2026-07", EVENING_UTC)).rejects.toMatchObject({
      status: 404,
    });
  });
});

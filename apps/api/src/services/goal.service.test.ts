import type { GoalWithRollup, Horizon } from "@tracker/shared";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";

import { Goal, User } from "@tracker/db";
import { hashPassword } from "./auth.service.js";
import {
  createGoal,
  deleteGoal,
  getGoalDetail,
  listGoals,
  listTodayGoals,
  setGoalCompleted,
  updateGoal,
} from "./goal.service.js";

/** A UTC instant that is already the NEXT day in Asia/Kolkata (+05:30). */
const EVENING_UTC = new Date("2026-07-26T18:30:00.000Z");
const TODAY_IST = "2026-07-27";
const TODAY_UTC = "2026-07-26";

let userId: string;
let utcUserId: string;

async function makeUser(email: string, timezone: string): Promise<string> {
  const user = await User.create({
    email,
    passwordHash: await hashPassword("a-long-enough-password"),
    timezone,
  });
  return String(user._id);
}

beforeEach(async () => {
  userId = await makeUser("goals@tracker.local", "Asia/Kolkata");
  utcUserId = await makeUser("utc@tracker.local", "UTC");
});

const add = (horizon: Horizon, extra: Record<string, unknown> = {}, owner = userId) =>
  createGoal(owner, { title: `${horizon} goal`, horizon, ...extra } as never, EVENING_UTC);

/**
 * Same as `add`, but pins `createdAt` instead of letting Mongoose stamp the wall
 * clock.
 *
 * A daily goal's implicit due date is derived from createdAt, so any test that
 * asserts on it and only injects `now` is a time bomb: it passes on the day it was
 * written and fails the next morning. Both halves of the comparison have to be
 * fixed, not just one.
 */
async function addAt(
  horizon: Horizon,
  createdAt: Date,
  extra: Record<string, unknown> = {},
  owner = userId,
): Promise<GoalWithRollup> {
  const goal = await add(horizon, extra, owner);
  // Mongoose marks a `timestamps: true` createdAt immutable, so $set through the
  // model is silently dropped. The raw driver is the only way to backdate it.
  await Goal.collection.updateOne(
    { _id: new Types.ObjectId(goal._id) },
    { $set: { createdAt } },
  );
  return { ...goal, createdAt: createdAt.toISOString() };
}

describe("horizon ordering", () => {
  it("accepts a parent one step higher", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });
    expect(month.parentGoalId).toBe(year._id);
  });

  it("accepts a skip — daily straight to yearly is legal", async () => {
    const year = await add("yearly");
    const daily = await add("daily", { parentGoalId: year._id });
    expect(daily.parentGoalId).toBe(year._id);
  });

  it("rejects a parent at the same horizon", async () => {
    const first = await add("monthly");
    await expect(add("monthly", { parentGoalId: first._id })).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects a parent at a lower horizon", async () => {
    const daily = await add("daily");
    await expect(add("yearly", { parentGoalId: daily._id })).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a parent belonging to somebody else", async () => {
    const mine = await add("yearly");
    await expect(add("monthly", { parentGoalId: mine._id }, utcUserId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("blocks a horizon change that would leave the parent below it", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });
    // monthly → longterm would put the child above its own yearly parent.
    await expect(
      updateGoal(userId, month._id, { horizon: "longterm" }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("blocks a horizon change that would leave a child above it", async () => {
    const year = await add("yearly");
    await add("monthly", { parentGoalId: year._id });
    // yearly → daily would put the parent below its monthly child.
    await expect(
      updateGoal(userId, year._id, { horizon: "daily" }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("allows a horizon change that keeps every link valid", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });
    const moved = await updateGoal(userId, month._id, { horizon: "weekly" }, EVENING_UTC);
    expect(moved.horizon).toBe("weekly");
  });
});

describe("cycle prevention", () => {
  it("refuses a goal as its own parent", async () => {
    const goal = await add("yearly");
    await expect(
      updateGoal(userId, goal._id, { parentGoalId: goal._id }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuses a direct descendant as a parent", async () => {
    const longterm = await add("longterm");
    const year = await add("yearly", { parentGoalId: longterm._id });

    await expect(
      updateGoal(userId, longterm._id, { parentGoalId: year._id }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("loop") });
  });

  it("refuses a descendant several hops down", async () => {
    const longterm = await add("longterm");
    const year = await add("yearly", { parentGoalId: longterm._id });
    const month = await add("monthly", { parentGoalId: year._id });
    const week = await add("weekly", { parentGoalId: month._id });

    // The walk has to climb week → month → year → longterm to see the problem.
    await expect(
      updateGoal(userId, longterm._id, { parentGoalId: week._id }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("loop") });
  });

  it("reports a same-horizon parent as a horizon problem, not a loop", async () => {
    const first = await add("monthly");
    const second = await add("monthly");
    await expect(
      updateGoal(userId, first._id, { parentGoalId: second._id }, EVENING_UTC),
    ).rejects.toMatchObject({ message: expect.stringContaining("higher horizon") });
  });

  /**
   * These two go after what the horizon rule could never catch: an inconsistent
   * chain written DIRECTLY through the model, the way a migration, a script, or a
   * bug in the check above would. The service must refuse to build on it rather
   * than spinning.
   */
  it("catches a loop the horizon rule cannot see", async () => {
    const month = await add("monthly");
    const year = await add("yearly");

    // Bad data: a yearly goal parented to a monthly one. Impossible via the API.
    await Goal.updateOne(
      { _id: year._id },
      { $set: { parentGoalId: new Types.ObjectId(month._id) } },
    );

    // month → year passes the horizon check, but year already points back at month.
    await expect(
      updateGoal(userId, month._id, { parentGoalId: year._id }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("loop") });
  });

  it("terminates on a pre-existing cycle instead of spinning forever", async () => {
    const a = await add("yearly");
    const b = await add("monthly");

    // A closed two-goal loop, written straight to the database.
    await Goal.updateOne({ _id: a._id }, { $set: { parentGoalId: new Types.ObjectId(b._id) } });
    await Goal.updateOne({ _id: b._id }, { $set: { parentGoalId: new Types.ObjectId(a._id) } });

    const week = await add("weekly");
    const startedAt = Date.now();
    // `week` is not in the loop, so the walk finds nothing and must exit on the
    // hop bound rather than running until the test times out.
    await updateGoal(userId, week._id, { parentGoalId: a._id }, EVENING_UTC);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("allows re-parenting that is not a loop", async () => {
    const longterm = await add("longterm");
    const yearA = await add("yearly", { parentGoalId: longterm._id });
    const yearB = await add("yearly");
    const month = await add("monthly", { parentGoalId: yearA._id });

    const moved = await updateGoal(userId, month._id, { parentGoalId: yearB._id }, EVENING_UTC);
    expect(moved.parentGoalId).toBe(yearB._id);
  });

  it("clears the parent when passed null", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });
    const detached = await updateGoal(userId, month._id, { parentGoalId: null }, EVENING_UTC);
    expect(detached.parentGoalId).toBeNull();
  });
});

describe("rollup", () => {
  it("counts completed children — 3 of 12 is 25%", async () => {
    const year = await add("yearly");
    const months = [];
    for (let index = 0; index < 12; index += 1) {
      months.push(await add("monthly", { parentGoalId: year._id }));
    }
    for (const month of months.slice(0, 3)) {
      await setGoalCompleted(userId, month._id, true, EVENING_UTC);
    }

    const detail = await getGoalDetail(userId, year._id, EVENING_UTC);
    expect(detail.rollup).toEqual({
      completedChildren: 3,
      totalChildren: 12,
      progressPercent: 25,
    });
  });

  it("rounds to the nearest whole percent", async () => {
    const year = await add("yearly");
    const a = await add("monthly", { parentGoalId: year._id });
    await add("monthly", { parentGoalId: year._id });
    await add("monthly", { parentGoalId: year._id });
    await setGoalCompleted(userId, a._id, true, EVENING_UTC);

    // 1/3 = 33.33… → 33
    const detail = await getGoalDetail(userId, year._id, EVENING_UTC);
    expect(detail.rollup.progressPercent).toBe(33);
  });

  it("reports null progress with no children and no target", async () => {
    const goal = await add("yearly");
    const detail = await getGoalDetail(userId, goal._id, EVENING_UTC);
    expect(detail.rollup).toEqual({
      completedChildren: 0,
      totalChildren: 0,
      progressPercent: null,
    });
  });

  it("falls back to currentValue/targetValue when there are no children", async () => {
    const goal = await add("yearly", { targetValue: 12, currentValue: 3 });
    const detail = await getGoalDetail(userId, goal._id, EVENING_UTC);
    expect(detail.rollup.progressPercent).toBe(25);
    expect(detail.rollup.totalChildren).toBe(0);
  });

  it("prefers children over the target when both exist", async () => {
    const year = await add("yearly", { targetValue: 100, currentValue: 99 });
    const month = await add("monthly", { parentGoalId: year._id });
    await add("monthly", { parentGoalId: year._id });
    await setGoalCompleted(userId, month._id, true, EVENING_UTC);

    const detail = await getGoalDetail(userId, year._id, EVENING_UTC);
    expect(detail.rollup.progressPercent).toBe(50);
  });

  it("caps an overshooting target at 100%", async () => {
    const goal = await add("yearly", { targetValue: 10, currentValue: 15 });
    const detail = await getGoalDetail(userId, goal._id, EVENING_UTC);
    expect(detail.rollup.progressPercent).toBe(100);
  });

  it("lets a parent be completed regardless of its children", async () => {
    const year = await add("yearly");
    await add("monthly", { parentGoalId: year._id });
    await add("monthly", { parentGoalId: year._id });

    const done = await setGoalCompleted(userId, year._id, true, EVENING_UTC);
    expect(done.status).toBe("done");
    // The ratio still shows underneath.
    expect(done.rollup).toEqual({
      completedChildren: 0,
      totalChildren: 2,
      progressPercent: 0,
    });
  });

  it("shows only immediate children, not grandchildren", async () => {
    const longterm = await add("longterm");
    const year = await add("yearly", { parentGoalId: longterm._id });
    await add("monthly", { parentGoalId: year._id });

    const detail = await getGoalDetail(userId, longterm._id, EVENING_UTC);
    expect(detail.rollup.totalChildren).toBe(1);
    expect(detail.children).toHaveLength(1);
    expect(detail.children[0]?._id).toBe(year._id);
  });

  it("never counts another user's goals as children", async () => {
    const year = await add("yearly");
    // Same parent id, different owner — must be invisible to the rollup.
    await User.updateOne({ _id: utcUserId }, { $set: { timezone: "UTC" } });
    const detail = await getGoalDetail(userId, year._id, EVENING_UTC);
    expect(detail.rollup.totalChildren).toBe(0);
  });
});

describe("derived status and overdue", () => {
  it("treats a past dueDate as overdue", async () => {
    const goal = await add("monthly", { dueDate: "2026-07-01" });
    const [listed] = await listGoals(userId, { status: "overdue" }, EVENING_UTC);
    expect(listed?._id).toBe(goal._id);
    expect(listed?.isOverdue).toBe(true);
  });

  it("treats today's dueDate as active, not overdue", async () => {
    await add("monthly", { dueDate: TODAY_IST });
    const overdue = await listGoals(userId, { status: "overdue" }, EVENING_UTC);
    const active = await listGoals(userId, { status: "active" }, EVENING_UTC);
    expect(overdue).toHaveLength(0);
    expect(active).toHaveLength(1);
  });

  it("never marks a long-term goal without a dueDate as overdue", async () => {
    await add("longterm");
    const overdue = await listGoals(userId, { status: "overdue" }, EVENING_UTC);
    expect(overdue).toHaveLength(0);
  });

  it("gives a daily goal an implicit due date of its own day", async () => {
    // Created at 18:30 UTC, which is already the 27th in Asia/Kolkata.
    const daily = await addAt("daily", EVENING_UTC);
    const detail = await getGoalDetail(userId, daily._id, EVENING_UTC);
    expect(detail.effectiveDueDate).toBe(TODAY_IST);
    expect(detail.isOverdue).toBe(false);
  });

  it("marks yesterday's unfinished daily goal overdue today", async () => {
    const daily = await addAt("daily", EVENING_UTC);
    // A day later in the same zone.
    const tomorrow = new Date("2026-07-27T18:30:00.000Z");
    const detail = await getGoalDetail(userId, daily._id, tomorrow);
    expect(detail.isOverdue).toBe(true);
  });

  it("a completed goal is never overdue", async () => {
    const goal = await add("monthly", { dueDate: "2026-07-01" });
    await setGoalCompleted(userId, goal._id, true, EVENING_UTC);
    const detail = await getGoalDetail(userId, goal._id, EVENING_UTC);
    expect(detail.isOverdue).toBe(false);
    expect(detail.status).toBe("done");
  });

  it("splits the same instant differently for a UTC user and an IST user", async () => {
    // Due on the 27th. In Asia/Kolkata it is already the 27th → active.
    // For the UTC user it is still the 26th → also active, but a due date of the
    // 26th is overdue for IST and current for UTC. That is the drift this app
    // exists to avoid.
    await add("monthly", { dueDate: TODAY_UTC });
    await add("monthly", { dueDate: TODAY_UTC }, utcUserId);

    const istOverdue = await listGoals(userId, { status: "overdue" }, EVENING_UTC);
    const utcOverdue = await listGoals(utcUserId, { status: "overdue" }, EVENING_UTC);

    expect(istOverdue).toHaveLength(1); // 2026-07-26 < 2026-07-27
    expect(utcOverdue).toHaveLength(0); // 2026-07-26 === today in UTC
  });

  it("stamps the completion date in the user's timezone, not the server's", async () => {
    const mine = await add("monthly");
    const theirs = await add("monthly", {}, utcUserId);

    const istDone = await setGoalCompleted(userId, mine._id, true, EVENING_UTC);
    const utcDone = await setGoalCompleted(utcUserId, theirs._id, true, EVENING_UTC);

    expect(istDone.completedDate).toBe(TODAY_IST);
    expect(utcDone.completedDate).toBe(TODAY_UTC);
  });

  it("un-completing clears the completion date", async () => {
    const goal = await add("monthly");
    await setGoalCompleted(userId, goal._id, true, EVENING_UTC);
    const reopened = await setGoalCompleted(userId, goal._id, false, EVENING_UTC);

    expect(reopened.status).toBe("active");
    expect(reopened.completedDate).toBeUndefined();
  });
});

describe("listing", () => {
  it("filters by horizon", async () => {
    await add("daily");
    await add("weekly");
    const weekly = await listGoals(userId, { horizon: "weekly" }, EVENING_UTC);
    expect(weekly).toHaveLength(1);
    expect(weekly[0]?.horizon).toBe("weekly");
  });

  it("filters to top-level goals with parentGoalId=none", async () => {
    const year = await add("yearly");
    await add("monthly", { parentGoalId: year._id });
    const top = await listGoals(userId, { parentGoalId: "none" }, EVENING_UTC);
    expect(top).toHaveLength(1);
    expect(top[0]?._id).toBe(year._id);
  });

  it("filters to one parent's children", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });
    await add("monthly");
    const children = await listGoals(userId, { parentGoalId: year._id }, EVENING_UTC);
    expect(children.map((goal) => goal._id)).toEqual([month._id]);
  });

  it("never returns another user's goals", async () => {
    await add("daily");
    const theirs = await listGoals(utcUserId, {}, EVENING_UTC);
    expect(theirs).toHaveLength(0);
  });

  it("orders by sortOrder then creation", async () => {
    const second = await add("daily", { sortOrder: 2 });
    const first = await add("daily", { sortOrder: 1 });
    const listed = await listGoals(userId, { horizon: "daily" }, EVENING_UTC);
    expect(listed.map((goal) => goal._id)).toEqual([first._id, second._id]);
  });
});

describe("today's goals", () => {
  it("includes today's daily goals and anything else due today", async () => {
    const daily = await addAt("daily", EVENING_UTC);
    const dueToday = await add("monthly", { dueDate: TODAY_IST });
    await add("monthly", { dueDate: "2026-12-31" });

    const todays = await listTodayGoals(userId, EVENING_UTC);
    expect(new Set(todays.map((goal) => goal._id))).toEqual(new Set([daily._id, dueToday._id]));
  });

  it("keeps a goal completed today in the list, so its tick still shows", async () => {
    const daily = await add("daily");
    await setGoalCompleted(userId, daily._id, true, EVENING_UTC);

    const todays = await listTodayGoals(userId, EVENING_UTC);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.status).toBe("done");
  });

  it("carries over an unfinished daily goal from an earlier day", async () => {
    await addAt("daily", EVENING_UTC);
    const tomorrow = new Date("2026-07-27T18:30:00.000Z");
    const todays = await listTodayGoals(userId, tomorrow);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.isOverdue).toBe(true);
  });

  it("drops a goal that was completed on an earlier day", async () => {
    const daily = await add("daily");
    await setGoalCompleted(userId, daily._id, true, EVENING_UTC);
    const tomorrow = new Date("2026-07-27T18:30:00.000Z");
    expect(await listTodayGoals(userId, tomorrow)).toHaveLength(0);
  });
});

describe("delete", () => {
  it("detaches children instead of cascading", async () => {
    const year = await add("yearly");
    const month = await add("monthly", { parentGoalId: year._id });

    const result = await deleteGoal(userId, year._id);
    expect(result.detached).toBe(1);

    const survivor = await getGoalDetail(userId, month._id, EVENING_UTC);
    expect(survivor.parentGoalId).toBeNull();
  });

  it("refuses to delete somebody else's goal", async () => {
    const mine = await add("yearly");
    await expect(deleteGoal(utcUserId, mine._id)).rejects.toMatchObject({ status: 404 });
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { Checkin, Goal, User } from "@tracker/db";
import { hashPassword } from "./auth.service.js";
import { getCheckin, listCheckins, upsertCheckin } from "./checkin.service.js";
import { createGoal } from "./goal.service.js";

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
  userId = await makeUser("checkin@tracker.local");
  otherId = await makeUser("other-checkin@tracker.local");
});

const countFor = (owner = userId, date = TODAY) =>
  Checkin.countDocuments({ userId: owner, date });

describe("one document per day", () => {
  it("creates the day on first write", async () => {
    const checkin = await upsertCheckin(userId, { mood: 4 }, EVENING_UTC);
    expect(checkin.date).toBe(TODAY);
    expect(checkin.mood).toBe(4);
    expect(await countFor()).toBe(1);
  });

  it("UPDATES rather than duplicating on a second submit", async () => {
    await upsertCheckin(userId, { mood: 4, energy: 3, sleepHours: 7 }, EVENING_UTC);
    await upsertCheckin(userId, { mood: 2, energy: 5, sleepHours: 6.5 }, EVENING_UTC);

    // The invariant the whole ritual rests on.
    expect(await countFor()).toBe(1);

    const checkin = await getCheckin(userId, TODAY, EVENING_UTC);
    expect(checkin).toMatchObject({ mood: 2, energy: 5, sleepHours: 6.5 });
  });

  it("survives ten rapid submissions as one row", async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await upsertCheckin(userId, { mood: (attempt % 5) + 1 }, EVENING_UTC);
    }
    expect(await countFor()).toBe(1);
  });

  it("keeps each user's day separate", async () => {
    await upsertCheckin(userId, { mood: 4 }, EVENING_UTC);
    await upsertCheckin(otherId, { mood: 1 }, EVENING_UTC);

    // Same date, two owners, two documents — the unique index is compound.
    expect(await countFor(userId)).toBe(1);
    expect(await countFor(otherId)).toBe(1);
    expect(await getCheckin(userId, TODAY, EVENING_UTC)).toMatchObject({ mood: 4 });
    expect(await getCheckin(otherId, TODAY, EVENING_UTC)).toMatchObject({ mood: 1 });
  });
});

describe("partial saves never clobber", () => {
  it("leaves untouched fields alone", async () => {
    await upsertCheckin(userId, { moment: "Walked the long way home" }, EVENING_UTC);
    await upsertCheckin(userId, { mood: 5 }, EVENING_UTC);

    const checkin = await getCheckin(userId, TODAY, EVENING_UTC);
    // The one-tap mood log must not blank the moment already typed.
    expect(checkin).toMatchObject({ moment: "Walked the long way home", mood: 5 });
  });

  it("treats explicit null as a clear, distinct from absent", async () => {
    await upsertCheckin(userId, { mood: 5, moment: "Something" }, EVENING_UTC);
    await upsertCheckin(userId, { moment: null }, EVENING_UTC);

    const checkin = await getCheckin(userId, TODAY, EVENING_UTC);
    expect(checkin).toMatchObject({ mood: 5 });
    expect("moment" in checkin ? checkin.moment : undefined).toBeUndefined();
  });

  it("allows logging only mood, and only habits' absence, and coming back", async () => {
    const first = await upsertCheckin(userId, { mood: 3 }, EVENING_UTC);
    expect(first.completed).toBe(false);

    const second = await upsertCheckin(userId, { intention: "Finish the notes" }, EVENING_UTC);
    expect(second.completed).toBe(false);
    expect(second.mood).toBe(3);
  });

  it("only marks completed when the evening flow says so", async () => {
    await upsertCheckin(userId, { mood: 3 }, EVENING_UTC);
    const done = await upsertCheckin(userId, { completed: true }, EVENING_UTC);
    expect(done.completed).toBe(true);
    expect(done.mood).toBe(3);
  });
});

describe("dates", () => {
  it("defaults to today in the user's timezone, not the server's", async () => {
    const utcUser = await makeUser("utc-checkin@tracker.local", "UTC");
    const mine = await upsertCheckin(userId, { mood: 3 }, EVENING_UTC);
    const theirs = await upsertCheckin(utcUser, { mood: 3 }, EVENING_UTC);

    expect(mine.date).toBe(TODAY); // 2026-07-27 in IST
    expect(theirs.date).toBe(YESTERDAY); // still 2026-07-26 in UTC
  });

  it("backfills a past day into its own document", async () => {
    await upsertCheckin(userId, { mood: 4 }, EVENING_UTC);
    const backfilled = await upsertCheckin(
      userId,
      { date: YESTERDAY, mood: 2, moment: "Missed logging this" },
      EVENING_UTC,
    );

    expect(backfilled.date).toBe(YESTERDAY);
    expect(await countFor(userId, TODAY)).toBe(1);
    expect(await countFor(userId, YESTERDAY)).toBe(1);
  });

  it("re-editing a backfilled day still does not duplicate", async () => {
    await upsertCheckin(userId, { date: YESTERDAY, mood: 2 }, EVENING_UTC);
    await upsertCheckin(userId, { date: YESTERDAY, mood: 5 }, EVENING_UTC);

    expect(await countFor(userId, YESTERDAY)).toBe(1);
    const checkin = await getCheckin(userId, YESTERDAY, EVENING_UTC);
    expect(checkin).toMatchObject({ mood: 5 });
  });

  it("rejects a future day", async () => {
    await expect(
      upsertCheckin(userId, { date: "2026-07-28", mood: 3 }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a day beyond the backfill window", async () => {
    await expect(
      upsertCheckin(userId, { date: "2026-07-01", mood: 3 }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("accepts the oldest day still inside the window", async () => {
    // 14 days back from 2026-07-27.
    const edge = await upsertCheckin(userId, { date: "2026-07-13", mood: 3 }, EVENING_UTC);
    expect(edge.date).toBe("2026-07-13");
  });
});

describe("goal completion reuses the goals service", () => {
  it("completes the ticked goals and stamps the date in the user's timezone", async () => {
    const goal = await createGoal(
      userId,
      { title: "Walk", horizon: "daily" } as never,
      EVENING_UTC,
    );

    const checkin = await upsertCheckin(
      userId,
      { completedGoalIds: [goal._id], completed: true },
      EVENING_UTC,
    );

    expect(checkin.completedGoalIds).toEqual([goal._id]);

    const stored = await Goal.findById(goal._id).lean();
    expect(stored?.status).toBe("done");
    // Stamped by goalService, in IST — not the server's 2026-07-26.
    expect(stored?.completedDate).toBe(TODAY);
  });

  it("refuses a goal belonging to somebody else", async () => {
    const mine = await createGoal(
      userId,
      { title: "Mine", horizon: "daily" } as never,
      EVENING_UTC,
    );
    await expect(
      upsertCheckin(otherId, { completedGoalIds: [mine._id] }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("is idempotent when the same goal is submitted twice", async () => {
    const goal = await createGoal(
      userId,
      { title: "Walk", horizon: "daily" } as never,
      EVENING_UTC,
    );
    await upsertCheckin(userId, { completedGoalIds: [goal._id] }, EVENING_UTC);
    await upsertCheckin(userId, { completedGoalIds: [goal._id] }, EVENING_UTC);

    expect(await countFor()).toBe(1);
    const checkin = await getCheckin(userId, TODAY, EVENING_UTC);
    expect("completedGoalIds" in checkin ? checkin.completedGoalIds : []).toEqual([goal._id]);
  });
});

describe("reads", () => {
  it("returns an empty shell for a day with nothing logged", async () => {
    const checkin = await getCheckin(userId, TODAY, EVENING_UTC);
    expect(checkin).toEqual({ date: TODAY, exists: false });
  });

  it("returns the month in date order", async () => {
    await upsertCheckin(userId, { date: "2026-07-20", mood: 1 }, EVENING_UTC);
    await upsertCheckin(userId, { date: TODAY, mood: 5 }, EVENING_UTC);
    await upsertCheckin(userId, { date: "2026-07-15", mood: 3 }, EVENING_UTC);

    const month = await listCheckins(userId, "2026-07");
    expect(month.map((entry) => entry.date)).toEqual(["2026-07-15", "2026-07-20", TODAY]);
  });

  it("never returns another user's month", async () => {
    await upsertCheckin(userId, { mood: 4 }, EVENING_UTC);
    expect(await listCheckins(otherId, "2026-07")).toEqual([]);
  });

  it("excludes days outside the month", async () => {
    await upsertCheckin(userId, { date: TODAY, mood: 4 }, EVENING_UTC);
    expect(await listCheckins(userId, "2026-06")).toEqual([]);
  });
});

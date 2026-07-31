import { describe, expect, it } from "vitest";

import { request, signUpAndIn, type Session } from "../test/helpers.js";

let session: Session;
let other: Session;

async function signIn(): Promise<void> {
  session = await signUpAndIn({ email: "checkinroutes@tracker.local", timezone: "Asia/Kolkata" });
  other = await signUpAndIn({ email: "checkin-intruder@tracker.local" });
}

const auth = () => `Bearer ${session.accessToken}`;

const post = (body: Record<string, unknown>) =>
  request().post("/api/checkins").set("Authorization", auth()).send(body);

/** Today in the session user's own timezone, from the API — never the test clock. */
async function todayForUser(): Promise<string> {
  const response = await request()
    .get("/api/checkins/today")
    .set("Authorization", auth())
    .expect(200);
  return response.body.data.checkin.date as string;
}

describe("check-in routes", () => {
  it("requires auth everywhere", async () => {
    await signIn();
    for (const [method, path] of [
      ["post", "/api/checkins"],
      ["get", "/api/checkins/today"],
      ["get", "/api/checkins?month=2026-07"],
      ["get", "/api/checkins/2026-07-27"],
    ] as const) {
      await request()[method](path).expect(401);
    }
  });

  it("returns an empty shell before anything is logged", async () => {
    await signIn();
    const response = await request()
      .get("/api/checkins/today")
      .set("Authorization", auth())
      .expect(200);

    expect(response.body.data.checkin.exists).toBe(false);
    expect(response.body.data.checkin.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("upserts and reads back the whole ritual", async () => {
    await signIn();
    const created = await post({
      mood: 4,
      energy: 3,
      sleepHours: 7.5,
      moment: "Walked the long way home",
      intention: "Finish the reading notes",
      completed: true,
    }).expect(200);

    expect(created.body.data.checkin).toMatchObject({
      mood: 4,
      energy: 3,
      sleepHours: 7.5,
      moment: "Walked the long way home",
      completed: true,
    });

    const read = await request()
      .get("/api/checkins/today")
      .set("Authorization", auth())
      .expect(200);
    expect(read.body.data.checkin.exists).toBe(true);
    expect(read.body.data.checkin.mood).toBe(4);
  });

  it("submitting twice updates one document", async () => {
    await signIn();
    await post({ mood: 1 }).expect(200);
    await post({ mood: 5 }).expect(200);

    const month = await request()
      .get(`/api/checkins?month=${(await todayForUser()).slice(0, 7)}`)
      .set("Authorization", auth())
      .expect(200);

    const today = await todayForUser();
    const forToday = month.body.data.checkins.filter(
      (entry: { date: string }) => entry.date === today,
    );
    expect(forToday).toHaveLength(1);
    expect(forToday[0].mood).toBe(5);
  });

  it("rejects mood and energy outside 1–5", async () => {
    await signIn();
    for (const body of [{ mood: 0 }, { mood: 6 }, { mood: 10 }, { energy: 0 }, { energy: 6 }]) {
      const failed = await post(body).expect(422);
      expect(failed.body.error.code).toBe("VALIDATION_FAILED");
    }
    // The old 1–10 scale is now genuinely invalid, not silently clamped.
    await post({ mood: 8 }).expect(422);
  });

  it("accepts every square of the 1–5 scale", async () => {
    await signIn();
    for (const value of [1, 2, 3, 4, 5]) {
      await post({ mood: value, energy: value }).expect(200);
    }
  });

  it("rejects a non-integer mood", async () => {
    await signIn();
    await post({ mood: 3.5 }).expect(422);
  });

  it("rejects sleep outside 0–24 or off the half hour", async () => {
    await signIn();
    await post({ sleepHours: -1 }).expect(422);
    await post({ sleepHours: 24.5 }).expect(422);
    await post({ sleepHours: 7.3 }).expect(422);
    // Valid: whole and half hours, and the boundaries.
    await post({ sleepHours: 0 }).expect(200);
    await post({ sleepHours: 7.5 }).expect(200);
    await post({ sleepHours: 24 }).expect(200);
  });

  it("blocks a future date with a clear message", async () => {
    await signIn();
    const failed = await post({ date: "2099-01-01", mood: 3 }).expect(422);
    expect(failed.body.error.message).toContain("has not happened yet");
  });

  it("blocks a date beyond the backfill window", async () => {
    await signIn();
    const failed = await post({ date: "2020-01-01", mood: 3 }).expect(422);
    expect(failed.body.error.message).toContain("14 days");
  });

  it("rejects a malformed day key and month", async () => {
    await signIn();
    await post({ date: "27-07-2026", mood: 3 }).expect(422);
    await request().get("/api/checkins?month=2026-13").set("Authorization", auth()).expect(422);
    await request().get("/api/checkins/nonsense").set("Authorization", auth()).expect(422);
  });

  it("rejects an empty body", async () => {
    await signIn();
    await post({}).expect(422);
  });

  it("routes /checkins/today ahead of /checkins/:date", async () => {
    await signIn();
    await request().get("/api/checkins/today").set("Authorization", auth()).expect(200);
  });

  it("never returns another user's check-in", async () => {
    await signIn();
    await post({ mood: 5, moment: "Private" }).expect(200);

    const theirs = await request()
      .get("/api/checkins/today")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .expect(200);
    expect(theirs.body.data.checkin.exists).toBe(false);

    const theirMonth = await request()
      .get("/api/checkins?month=2026-07")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .expect(200);
    expect(theirMonth.body.data.checkins).toEqual([]);
  });

  it("404s when ticking a goal that is not yours", async () => {
    await signIn();
    const goal = await request()
      .post("/api/goals")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ title: "Theirs", horizon: "daily" })
      .expect(201);

    await post({ completedGoalIds: [goal.body.data.goal._id] }).expect(404);
  });
});

import { describe, expect, it } from "vitest";

import { request, signUpAndIn, type Session } from "../test/helpers.js";

let session: Session;
let other: Session;

async function signIn(): Promise<void> {
  session = await signUpAndIn({ email: "habitroutes@tracker.local", timezone: "Asia/Kolkata" });
  other = await signUpAndIn({ email: "habit-intruder@tracker.local" });
}

const auth = () => `Bearer ${session.accessToken}`;

async function createHabit(body: Record<string, unknown>): Promise<string> {
  const response = await request()
    .post("/api/habits")
    .set("Authorization", auth())
    .send(body)
    .expect(201);
  return response.body.data.habit._id as string;
}

/**
 * Today in the session user's own timezone.
 *
 * Derived from the API rather than from the test process's clock — a daily goal's
 * effectiveDueDate IS today for its owner. Hard-coding a date here would make these
 * tests pass on the day they were written and fail the next morning.
 */
async function todayForUser(): Promise<string> {
  const created = await request()
    .post("/api/goals")
    .set("Authorization", auth())
    .send({ title: "date probe", horizon: "daily" })
    .expect(201);
  return created.body.data.goal.effectiveDueDate as string;
}

describe("habit routes", () => {
  it("requires auth on every route", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });

    for (const [method, path] of [
      ["get", "/api/habits"],
      ["post", "/api/habits"],
      ["get", "/api/habits/grid?from=2026-07-01&to=2026-07-31"],
      ["patch", `/api/habits/${id}`],
      ["post", `/api/habits/${id}/archive`],
      ["get", `/api/habits/${id}/streak`],
      ["get", `/api/habits/${id}/heatmap?month=2026-07`],
      ["post", "/api/habit-logs"],
    ] as const) {
      await request()[method](path).expect(401);
    }
  });

  it("creates with a pastel and a glyph, then patches them", async () => {
    await signIn();
    const id = await createHabit({ name: "Read", pastel: "powder", pixelGlyph: "book" });

    const patched = await request()
      .patch(`/api/habits/${id}`)
      .set("Authorization", auth())
      .send({ name: "Read a chapter", pastel: "lilac" })
      .expect(200);

    expect(patched.body.data.habit.name).toBe("Read a chapter");
    expect(patched.body.data.habit.pastel).toBe("lilac");
    expect(patched.body.data.habit.pixelGlyph).toBe("book");
  });

  it("rejects an unknown pastel or glyph", async () => {
    await signIn();
    await request()
      .post("/api/habits")
      .set("Authorization", auth())
      .send({ name: "Read", pastel: "neon" })
      .expect(422);
    await request()
      .post("/api/habits")
      .set("Authorization", auth())
      .send({ name: "Read", pixelGlyph: "unicorn" })
      .expect(422);
  });

  it("rejects an empty name", async () => {
    await signIn();
    await request()
      .post("/api/habits")
      .set("Authorization", auth())
      .send({ name: "   " })
      .expect(422);
  });

  it("archives out of the default list and back in", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });

    await request().post(`/api/habits/${id}/archive`).set("Authorization", auth()).expect(200);

    const active = await request().get("/api/habits").set("Authorization", auth()).expect(200);
    expect(active.body.data.habits).toHaveLength(0);

    const all = await request()
      .get("/api/habits?includeArchived=true")
      .set("Authorization", auth())
      .expect(200);
    expect(all.body.data.habits).toHaveLength(1);

    await request().post(`/api/habits/${id}/restore`).set("Authorization", auth()).expect(200);
    const restored = await request().get("/api/habits").set("Authorization", auth()).expect(200);
    expect(restored.body.data.habits).toHaveLength(1);
  });

  it("ticks idempotently and un-ticks", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });
    const today = await todayForUser();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request()
        .post("/api/habit-logs")
        .set("Authorization", auth())
        .send({ habitId: id, date: today, done: true })
        .expect(200);
    }

    const grid = await request()
      .get(`/api/habits/grid?from=${today}&to=${today}`)
      .set("Authorization", auth())
      .expect(200);
    expect(grid.body.data.rows[0].days).toEqual({ [today]: true });

    await request()
      .post("/api/habit-logs")
      .set("Authorization", auth())
      .send({ habitId: id, date: today, done: false })
      .expect(200);

    const after = await request()
      .get(`/api/habits/grid?from=${today}&to=${today}`)
      .set("Authorization", auth())
      .expect(200);
    expect(after.body.data.rows[0].days).toEqual({});
  });

  it("refuses a future date with 422", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });
    await request()
      .post("/api/habit-logs")
      .set("Authorization", auth())
      .send({ habitId: id, date: "2099-01-01", done: true })
      .expect(422);
  });

  it("rejects a malformed day key, month, or reversed range", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });
    await request()
      .post("/api/habit-logs")
      .set("Authorization", auth())
      .send({ habitId: id, date: "26-07-2026", done: true })
      .expect(422);
    await request()
      .get(`/api/habits/${id}/heatmap?month=2026-13`)
      .set("Authorization", auth())
      .expect(422);
    await request()
      .get("/api/habits/grid?from=2026-07-31&to=2026-07-01")
      .set("Authorization", auth())
      .expect(422);
  });

  it("routes /habits/grid ahead of /habits/:id", async () => {
    await signIn();
    await createHabit({ name: "Read" });
    await request()
      .get("/api/habits/grid?from=2026-07-01&to=2026-07-31")
      .set("Authorization", auth())
      .expect(200);
  });

  it("returns a streak and a heatmap that agree", async () => {
    await signIn();
    const id = await createHabit({ name: "Read" });
    const today = await todayForUser();
    await request()
      .post("/api/habit-logs")
      .set("Authorization", auth())
      .send({ habitId: id, date: today, done: true })
      .expect(200);

    const streak = await request()
      .get(`/api/habits/${id}/streak`)
      .set("Authorization", auth())
      .expect(200);
    expect(streak.body.data.streak).toEqual({ current: 1, longest: 1 });

    const heatmap = await request()
      .get(`/api/habits/${id}/heatmap?month=${today.slice(0, 7)}`)
      .set("Authorization", auth())
      .expect(200);
    expect(heatmap.body.data.completed).toBe(1);
    expect(
      heatmap.body.data.days.find((day: { date: string }) => day.date === today).done,
    ).toBe(true);
  });

  it("hides another user's habit behind a 404", async () => {
    await signIn();
    const mine = await createHabit({ name: "Mine" });

    for (const call of [
      request().patch(`/api/habits/${mine}`).send({ name: "Yours" }),
      request().post(`/api/habits/${mine}/archive`),
      request().get(`/api/habits/${mine}/streak`),
      request().get(`/api/habits/${mine}/heatmap?month=2026-07`),
      request().post("/api/habit-logs").send({ habitId: mine, date: "2026-07-01", done: true }),
    ]) {
      await call.set("Authorization", `Bearer ${other.accessToken}`).expect(404);
    }
  });
});

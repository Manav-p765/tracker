import { describe, expect, it } from "vitest";

import { request, signUpAndIn, type Session } from "../test/helpers.js";

let session: Session;
let other: Session;

async function signIn(): Promise<void> {
  session = await signUpAndIn({ email: "goalroutes@tracker.local", timezone: "Asia/Kolkata" });
  other = await signUpAndIn({ email: "intruder@tracker.local" });
}

const auth = () => `Bearer ${session.accessToken}`;

async function createGoal(body: Record<string, unknown>, token = auth()): Promise<string> {
  const response = await request()
    .post("/api/goals")
    .set("Authorization", token)
    .send(body)
    .expect(201);
  return response.body.data.goal._id as string;
}

describe("goal routes", () => {
  it("requires auth on every route", async () => {
    await signIn();
    const id = await createGoal({ title: "Private", horizon: "yearly" });

    for (const [method, path] of [
      ["get", "/api/goals"],
      ["get", "/api/goals/today"],
      ["get", `/api/goals/${id}`],
      ["post", "/api/goals"],
      ["patch", `/api/goals/${id}`],
      ["post", `/api/goals/${id}/complete`],
      ["delete", `/api/goals/${id}`],
    ] as const) {
      await request()[method](path).expect(401);
    }
  });

  it("creates, reads, patches, completes and deletes", async () => {
    await signIn();

    const id = await createGoal({
      title: "Read 12 books",
      horizon: "yearly",
      targetValue: 12,
      difficulty: "medium",
      notes: "One a month",
    });

    const detail = await request()
      .get(`/api/goals/${id}`)
      .set("Authorization", auth())
      .expect(200);
    expect(detail.body.data.goal.title).toBe("Read 12 books");
    expect(detail.body.data.goal.rollup.progressPercent).toBe(0); // 0 of 12
    expect(detail.body.data.goal.parentChain).toEqual([]);
    expect(detail.body.data.goal.children).toEqual([]);

    const patched = await request()
      .patch(`/api/goals/${id}`)
      .set("Authorization", auth())
      .send({ currentValue: 3 })
      .expect(200);
    expect(patched.body.data.goal.currentValue).toBe(3);
    expect(patched.body.data.goal.rollup.progressPercent).toBe(25);

    const completed = await request()
      .post(`/api/goals/${id}/complete`)
      .set("Authorization", auth())
      .send({ completed: true })
      .expect(200);
    expect(completed.body.data.goal.status).toBe("done");
    expect(completed.body.data.goal.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await request().delete(`/api/goals/${id}`).set("Authorization", auth()).expect(200);
    await request().get(`/api/goals/${id}`).set("Authorization", auth()).expect(404);
  });

  it("routes /goals/today ahead of /goals/:id", async () => {
    await signIn();
    await createGoal({ title: "Today's thing", horizon: "daily" });

    const today = await request()
      .get("/api/goals/today")
      .set("Authorization", auth())
      .expect(200);
    expect(today.body.data.goals).toHaveLength(1);
  });

  it("rejects a malformed id with 422, not 500", async () => {
    await signIn();
    const failed = await request()
      .get("/api/goals/not-an-objectid")
      .set("Authorization", auth())
      .expect(422);
    expect(failed.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("404s on a well-formed id that does not exist", async () => {
    await signIn();
    await request()
      .get("/api/goals/6a67348f1fc1011ecb3a5192")
      .set("Authorization", auth())
      .expect(404);
  });

  it("hides another user's goal behind a 404", async () => {
    await signIn();
    const mine = await createGoal({ title: "Mine", horizon: "yearly" });

    for (const call of [
      request().get(`/api/goals/${mine}`),
      request().patch(`/api/goals/${mine}`).send({ title: "Yours now" }),
      request().post(`/api/goals/${mine}/complete`).send({ completed: true }),
      request().delete(`/api/goals/${mine}`),
    ]) {
      await call.set("Authorization", `Bearer ${other.accessToken}`).expect(404);
    }
  });

  it("rejects a bad horizon and an empty title", async () => {
    await signIn();
    await request()
      .post("/api/goals")
      .set("Authorization", auth())
      .send({ title: "Nope", horizon: "fortnightly" })
      .expect(422);
    await request()
      .post("/api/goals")
      .set("Authorization", auth())
      .send({ title: "   ", horizon: "daily" })
      .expect(422);
  });

  it("refuses a client-supplied status or completedDate", async () => {
    await signIn();
    const id = await createGoal({
      title: "Sneaky",
      horizon: "daily",
      status: "done",
      completedDate: "2020-01-01",
    });

    const detail = await request()
      .get(`/api/goals/${id}`)
      .set("Authorization", auth())
      .expect(200);
    // Stripped by the schema — completion only happens through /complete.
    expect(detail.body.data.goal.status).toBe("active");
    expect(detail.body.data.goal.completedDate).toBeUndefined();
  });

  it("rejects an invalid dueDate shape", async () => {
    await signIn();
    await request()
      .post("/api/goals")
      .set("Authorization", auth())
      .send({ title: "Bad date", horizon: "monthly", dueDate: "26-07-2026" })
      .expect(422);
    await request()
      .post("/api/goals")
      .set("Authorization", auth())
      .send({ title: "Impossible date", horizon: "monthly", dueDate: "2026-02-30" })
      .expect(422);
  });

  it("surfaces the horizon rule as a 422 with a readable message", async () => {
    await signIn();
    const daily = await createGoal({ title: "Low", horizon: "daily" });
    const failed = await request()
      .post("/api/goals")
      .set("Authorization", auth())
      .send({ title: "High", horizon: "yearly", parentGoalId: daily })
      .expect(422);
    expect(failed.body.error.message).toContain("higher horizon");
  });

  it("refuses to point a goal at its own descendant", async () => {
    await signIn();
    const longterm = await createGoal({ title: "LT", horizon: "longterm" });
    const yearly = await createGoal({
      title: "Y",
      horizon: "yearly",
      parentGoalId: longterm,
    });

    const failed = await request()
      .patch(`/api/goals/${longterm}`)
      .set("Authorization", auth())
      .send({ parentGoalId: yearly })
      .expect(422);
    expect(failed.body.error.message).toContain("loop");
  });

  it("reports a same-horizon parent as a horizon problem", async () => {
    await signIn();
    const first = await createGoal({ title: "One", horizon: "monthly" });
    const second = await createGoal({ title: "Two", horizon: "monthly" });

    const failed = await request()
      .patch(`/api/goals/${first}`)
      .set("Authorization", auth())
      .send({ parentGoalId: second })
      .expect(422);
    expect(failed.body.error.message).toContain("higher horizon");
  });

  it("refuses a goal as its own parent", async () => {
    await signIn();
    const id = await createGoal({ title: "Self", horizon: "yearly" });
    const failed = await request()
      .patch(`/api/goals/${id}`)
      .set("Authorization", auth())
      .send({ parentGoalId: id })
      .expect(422);
    expect(failed.body.error.message).toContain("its own parent");
  });

  it("filters the list by horizon and status", async () => {
    await signIn();
    await createGoal({ title: "Overdue one", horizon: "monthly", dueDate: "2020-01-01" });
    const fresh = await createGoal({ title: "Active one", horizon: "monthly" });

    const overdue = await request()
      .get("/api/goals?horizon=monthly&status=overdue")
      .set("Authorization", auth())
      .expect(200);
    expect(overdue.body.data.goals).toHaveLength(1);
    expect(overdue.body.data.goals[0].isOverdue).toBe(true);

    const active = await request()
      .get("/api/goals?horizon=monthly&status=active")
      .set("Authorization", auth())
      .expect(200);
    expect(active.body.data.goals.map((goal: { _id: string }) => goal._id)).toEqual([fresh]);
  });

  it("rejects an unknown status filter", async () => {
    await signIn();
    await request()
      .get("/api/goals?status=procrastinating")
      .set("Authorization", auth())
      .expect(422);
  });

  it("reports how many children a delete detached", async () => {
    await signIn();
    const year = await createGoal({ title: "Year", horizon: "yearly" });
    await createGoal({ title: "M1", horizon: "monthly", parentGoalId: year });
    await createGoal({ title: "M2", horizon: "monthly", parentGoalId: year });

    const deleted = await request()
      .delete(`/api/goals/${year}`)
      .set("Authorization", auth())
      .expect(200);
    expect(deleted.body.data.detached).toBe(2);

    // The children survived.
    const remaining = await request().get("/api/goals").set("Authorization", auth()).expect(200);
    expect(remaining.body.data.goals).toHaveLength(2);
  });

  it("builds the parent breadcrumb, nearest first", async () => {
    await signIn();
    const longterm = await createGoal({ title: "LT", horizon: "longterm" });
    const yearly = await createGoal({ title: "Y", horizon: "yearly", parentGoalId: longterm });
    const monthly = await createGoal({ title: "M", horizon: "monthly", parentGoalId: yearly });

    const detail = await request()
      .get(`/api/goals/${monthly}`)
      .set("Authorization", auth())
      .expect(200);
    expect(detail.body.data.goal.parentChain.map((goal: { _id: string }) => goal._id)).toEqual([
      yearly,
      longterm,
    ]);
  });
});

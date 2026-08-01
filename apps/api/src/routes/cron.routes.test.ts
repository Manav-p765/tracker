import { describe, expect, it } from "vitest";

import { request } from "../test/helpers.js";

/**
 * The cron endpoint's *gate*.
 *
 * The dispatch behaviour itself — scan, enqueue, dedupe across two calls, drain,
 * 410 cleanup — is covered in @tracker/reminders against an in-memory queue with
 * BullMQ's job-id semantics. What can only be tested here is the HTTP surface: who
 * is allowed to call it at all.
 *
 * Note the environment: these run without REDIS_URL, so an *authorised* call is
 * expected to fail at queue construction with 503 rather than 200. That is the
 * designed behaviour — no Redis means no idempotency, and a cron that quietly
 * loses its dedupe would double-notify at the exact moment nobody is watching.
 */

const SECRET = process.env.CRON_SECRET ?? "test-cron-secret";
const PATH = "/api/internal/cron/dispatch-reminders";

describe("cron dispatch — authentication", () => {
  it("401s with no credentials at all", async () => {
    const response = await request().post(PATH).expect(401);
    expect(response.body.error.code).toBeDefined();
  });

  it("401s with a wrong bearer token", async () => {
    await request().post(PATH).set("Authorization", "Bearer not-the-secret").expect(401);
  });

  it("401s with a bearer token that only shares a prefix", async () => {
    // The comparison is constant-time, but the outcome must still be a refusal.
    await request().post(PATH).set("Authorization", `Bearer ${SECRET.slice(0, 4)}`).expect(401);
  });

  it("401s when the secret is sent without the Bearer scheme", async () => {
    await request().post(PATH).set("Authorization", SECRET).expect(401);
  });

  it("401s on a wrong x-cron-secret header", async () => {
    await request().post(PATH).set("x-cron-secret", "nope").expect(401);
  });

  it("is NOT reachable by a signed-in user's access token", async () => {
    const { signUpAndIn } = await import("../test/helpers.js");
    const session = await signUpAndIn({ email: "cron-probe@tracker.local" });

    // A normal user token is not a cron secret — this endpoint is machine-only.
    await request().post(PATH).set("Authorization", `Bearer ${session.accessToken}`).expect(401);
  });

  it("gets PAST auth with the right secret", async () => {
    // Without Redis the run then fails at 503; the point is that it is no longer 401.
    const response = await request().post(PATH).set("Authorization", `Bearer ${SECRET}`);
    expect(response.status).not.toBe(401);
    expect([200, 503]).toContain(response.status);
  });

  it("accepts the x-cron-secret header too, for hand testing", async () => {
    const response = await request().post(PATH).set("x-cron-secret", SECRET);
    expect(response.status).not.toBe(401);
  });

  it("refuses GET — dispatch is a write", async () => {
    await request().get(PATH).set("Authorization", `Bearer ${SECRET}`).expect(404);
  });
});

describe("cron dispatch — failure is loud", () => {
  it("503s rather than running without a queue", async () => {
    const response = await request().post(PATH).set("Authorization", `Bearer ${SECRET}`);

    if (response.status === 503) {
      /**
       * No Redis in this environment. Two distinct refusals, both correct:
       *   - REDIS_URL unset      → "there is no idempotency"
       *   - set but unreachable  → "could not reach its queue"
       * Either way it refuses rather than sending without dedupe, and it does so
       * quickly instead of hanging until the platform kills the invocation.
       */
      expect(response.body.error.message).toMatch(/REDIS_URL|idempotency|reach its queue/i);
    } else {
      // With Redis configured it runs and returns the summary.
      expect(response.body.data).toMatchObject({
        scanned: expect.any(Number),
        enqueued: expect.any(Number),
        deduped: expect.any(Number),
        sent: expect.any(Number),
        failed: expect.any(Number),
      });
    }
  });
});

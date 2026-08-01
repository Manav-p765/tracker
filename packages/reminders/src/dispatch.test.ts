import { Checkin, PushSubscription, User } from "@tracker/db";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchReminders, type DispatchQueue } from "./dispatch.js";
import type { ReminderJob } from "./scan.js";

/**
 * The dispatch orchestration.
 *
 * The property under test is the one the whole cron design rests on: **calling the
 * endpoint twice in the same window sends each reminder exactly once.** That used
 * to be guaranteed by a single resident loop ticking once; now it is guaranteed by
 * the deterministic job id, so it needs proving directly.
 */

/** 15:30 UTC is exactly 21:00 in Asia/Kolkata — the default reminder moment. */
const AT_2100_IST = new Date("2026-07-27T15:30:00.000Z");
const AT_2100_UTC = new Date("2026-07-27T21:00:00.000Z");
const TODAY_IST = "2026-07-27";

/**
 * An in-memory queue with the same job-id semantics BullMQ gives us: adding an id
 * that already exists is a no-op, and a job is handed to exactly one drain.
 *
 * Standing in for Redis, which this machine does not have. It models the contract
 * the dispatch depends on, not BullMQ's implementation of it.
 */
function memoryQueue(): DispatchQueue & { seen: Set<string>; delivered: string[] } {
  const seen = new Set<string>();
  const pending = new Map<string, ReminderJob>();
  const delivered: string[] = [];

  return {
    seen,
    delivered,
    add: async (jobId, job) => {
      // The dedupe: an id that has ever been added is never added again.
      if (seen.has(jobId)) return { deduped: true };
      seen.add(jobId);
      pending.set(jobId, job);
      return { deduped: false };
    },
    drain: async (max, handler) => {
      let processed = 0;
      let failed = 0;
      for (const [jobId, job] of [...pending.entries()]) {
        if (processed >= max) break;
        // Claim before handling, so a concurrent drain cannot take it too.
        pending.delete(jobId);
        processed += 1;
        try {
          await handler(job);
          delivered.push(jobId);
        } catch {
          failed += 1;
          // A failed job goes back, exactly as a queue retry would.
          pending.set(jobId, job);
        }
      }
      return { processed, failed };
    },
  };
}

let userId: string;
let seq = 0;

async function seedDueUser(timezone = "Asia/Kolkata"): Promise<string> {
  seq += 1;
  const user = await User.create({
    email: `dispatch-${seq}@tracker.local`,
    passwordHash: "x".repeat(40),
    timezone,
    reminderTime: "21:00",
  });
  await PushSubscription.create({
    userId: user._id,
    endpoint: `https://fcm.googleapis.com/fcm/send/dispatch-${seq}`,
    keys: { p256dh: "p256dh-value", auth: "auth-value" },
  });
  return String(user._id);
}

const okSend = () => vi.fn().mockResolvedValue({ sent: 1, pruned: 0, failed: 0 });

beforeEach(async () => {
  seq = 0;
  userId = await seedDueUser();
});

describe("idempotency across two dispatch calls", () => {
  it("sends the check-in reminder ONCE when the endpoint is called twice", async () => {
    const queue = memoryQueue();
    const send = okSend();

    const first = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });
    const second = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });

    // Both calls see the reminder as due...
    expect(first.scanned).toBe(1);
    expect(second.scanned).toBe(1);
    // ...but only the first enqueues it.
    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);
    expect(second.deduped).toBe(1);

    // The property that matters: one notification.
    expect(send).toHaveBeenCalledTimes(1);
    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(queue.delivered).toEqual([`checkin-reminder:${userId}:${TODAY_IST}`]);
  });

  it("stays deduped across three overlapping calls", async () => {
    const queue = memoryQueue();
    const send = okSend();

    for (let call = 0; call < 3; call += 1) {
      await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });
    }

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("survives two dispatches running concurrently", async () => {
    const queue = memoryQueue();
    const send = okSend();

    await Promise.all([
      dispatchReminders(queue, { now: AT_2100_IST, send: send as never }),
      dispatchReminders(queue, { now: AT_2100_IST, send: send as never }),
    ]);

    // Concurrency may skew the `deduped` count, but never the send count.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends again the NEXT day — dedupe is per day, not forever", async () => {
    const queue = memoryQueue();
    const send = okSend();

    await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });
    await dispatchReminders(queue, {
      now: new Date("2026-07-28T15:30:00.000Z"),
      send: send as never,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect([...queue.seen]).toEqual([
      `checkin-reminder:${userId}:${TODAY_IST}`,
      `checkin-reminder:${userId}:2026-07-28`,
    ]);
  });
});

describe("timezone correctness is unchanged", () => {
  it("dispatches nothing for an IST user at 21:00 UTC", async () => {
    const queue = memoryQueue();
    const send = okSend();

    const summary = await dispatchReminders(queue, { now: AT_2100_UTC, send: send as never });

    expect(summary.scanned).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("dispatches for a UTC user at 21:00 UTC instead", async () => {
    await User.deleteMany({});
    await PushSubscription.deleteMany({});
    await seedDueUser("UTC");

    const queue = memoryQueue();
    const send = okSend();
    const summary = await dispatchReminders(queue, { now: AT_2100_UTC, send: send as never });

    expect(summary.sent).toBe(1);
  });
});

describe("skip rules survive the move", () => {
  it("sends nothing when the check-in is already done", async () => {
    await Checkin.create({
      userId: new Types.ObjectId(userId),
      date: TODAY_IST,
      completed: true,
    });

    const queue = memoryQueue();
    const send = okSend();
    const summary = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });

    expect(summary.scanned).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("failure containment", () => {
  it("one user's failed send does not stop another's", async () => {
    const second = await seedDueUser();

    const queue = memoryQueue();
    const send = vi.fn(async (owner: string) =>
      owner === userId
        ? { sent: 0, pruned: 0, failed: 1 } // transient
        : { sent: 1, pruned: 0, failed: 0 },
    );

    const summary = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });

    expect(send).toHaveBeenCalledTimes(2);
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
    // The good one went out despite the bad one.
    expect(queue.delivered).toEqual([`checkin-reminder:${second}:${TODAY_IST}`]);
  });

  it("keeps a failed job for the next tick rather than marking it sent", async () => {
    const queue = memoryQueue();
    const failing = vi.fn().mockResolvedValue({ sent: 0, pruned: 0, failed: 1 });

    await dispatchReminders(queue, { now: AT_2100_IST, send: failing as never });
    expect(queue.delivered).toEqual([]);

    // Next tick, the push service is healthy again.
    const recovering = okSend();
    const summary = await dispatchReminders(queue, {
      now: AT_2100_IST,
      send: recovering as never,
    });

    expect(recovering).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
  });

  it("reports pruned dead endpoints in the summary", async () => {
    const queue = memoryQueue();
    const send = vi.fn().mockResolvedValue({ sent: 1, pruned: 1, failed: 0 });

    const summary = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });
    expect(summary.pruned).toBe(1);
  });

  it("a scanner throwing does not stop the others", async () => {
    const queue = memoryQueue();
    const send = okSend();
    // Break the goal query specifically.
    const spy = vi
      .spyOn(User, "find")
      .mockImplementationOnce(() => {
        throw new Error("mongo is having a moment");
      });

    const summary = await dispatchReminders(queue, { now: AT_2100_IST, send: send as never });

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    spy.mockRestore();
  });
});

describe("bounded work", () => {
  it("caps the batch and reports truncation", async () => {
    for (let extra = 0; extra < 4; extra += 1) await seedDueUser();

    const queue = memoryQueue();
    const send = okSend();

    const summary = await dispatchReminders(queue, {
      now: AT_2100_IST,
      send: send as never,
      maxJobs: 2,
    });

    expect(summary.scanned).toBe(5);
    expect(summary.enqueued).toBe(5);
    expect(send).toHaveBeenCalledTimes(2);
    expect(summary.truncated).toBe(true);
  });

  it("the next tick finishes what the cap left behind", async () => {
    for (let extra = 0; extra < 2; extra += 1) await seedDueUser();

    const queue = memoryQueue();
    const send = okSend();

    await dispatchReminders(queue, { now: AT_2100_IST, send: send as never, maxJobs: 1 });
    await dispatchReminders(queue, { now: AT_2100_IST, send: send as never, maxJobs: 10 });

    // Three users, three notifications, no repeats.
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(queue.delivered).size).toBe(3);
  });
});

describe("summary shape", () => {
  it("returns every counter the endpoint reports", async () => {
    const queue = memoryQueue();
    const summary = await dispatchReminders(queue, {
      now: AT_2100_IST,
      send: okSend() as never,
    });

    expect(Object.keys(summary).sort()).toEqual([
      "deduped",
      "enqueued",
      "failed",
      "pruned",
      "scanned",
      "sent",
      "truncated",
    ]);
  });

  it("is all zeros in a quiet window", async () => {
    const queue = memoryQueue();
    const summary = await dispatchReminders(queue, {
      now: AT_2100_UTC,
      send: okSend() as never,
    });

    expect(summary).toMatchObject({ scanned: 0, enqueued: 0, sent: 0, failed: 0 });
  });
});

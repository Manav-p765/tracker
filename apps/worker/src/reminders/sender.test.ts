import { PushSubscription } from "@tracker/db";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebPushError } from "web-push";

import { sendToUser, type PushPayload } from "./sender.js";

/**
 * Delivery, with web-push itself stubbed.
 *
 * The real network call is not the interesting part — the dead-endpoint cleanup is.
 * A 410 must remove exactly that row and let the user's other devices through, or
 * every future send retries an endpoint that will never work again.
 */

const PAYLOAD: PushPayload = {
  title: "Evening check-in",
  body: "Time for your evening check-in.",
  tag: "tracker:checkin",
  url: "/checkin",
};

const PHONE = "https://fcm.googleapis.com/fcm/send/phone";
const LAPTOP = "https://fcm.googleapis.com/fcm/send/laptop";

let userId: string;

async function addDevice(endpoint: string, owner = userId): Promise<void> {
  await PushSubscription.create({
    userId: new Types.ObjectId(owner),
    endpoint,
    keys: { p256dh: "p256dh-value", auth: "auth-value" },
  });
}

/** A WebPushError with the status a push service would return. */
const pushError = (statusCode: number): WebPushError =>
  new WebPushError("gone", statusCode, {}, "", "");

beforeEach(() => {
  userId = String(new Types.ObjectId());
});

describe("sendToUser", () => {
  it("sends to every device the user has", async () => {
    await addDevice(PHONE);
    await addDevice(LAPTOP);
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result).toEqual({ sent: 2, pruned: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends the payload as JSON the service worker can read", async () => {
    await addDevice(PHONE);
    const send = vi.fn().mockResolvedValue(undefined);

    await sendToUser(userId, PAYLOAD, send as never);

    const [subscription, body] = send.mock.calls[0] ?? [];
    expect(subscription).toMatchObject({
      endpoint: PHONE,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });
    expect(JSON.parse(body as string)).toEqual(PAYLOAD);
  });

  it("sends NOTHING when the user has no devices", async () => {
    const send = vi.fn();
    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result).toEqual({ sent: 0, pruned: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("never sends to another user's device", async () => {
    await addDevice(PHONE, String(new Types.ObjectId()));
    const send = vi.fn();

    expect(await sendToUser(userId, PAYLOAD, send as never)).toEqual({
      sent: 0,
      pruned: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("dead-endpoint cleanup", () => {
  it("deletes exactly the 410 row and keeps delivering to the others", async () => {
    await addDevice(PHONE);
    await addDevice(LAPTOP);

    const send = vi.fn(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint === PHONE) throw pushError(410);
      return undefined;
    });

    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result).toEqual({ sent: 1, pruned: 1, failed: 0 });
    // The dead one is gone; the working one survives untouched.
    expect(await PushSubscription.findOne({ endpoint: PHONE })).toBeNull();
    expect(await PushSubscription.findOne({ endpoint: LAPTOP })).not.toBeNull();
  });

  it("also prunes on 404", async () => {
    await addDevice(PHONE);
    const send = vi.fn().mockRejectedValue(pushError(404));

    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result.pruned).toBe(1);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  it("KEEPS the row on a transient failure so a retry can succeed", async () => {
    await addDevice(PHONE);

    for (const status of [429, 500, 503]) {
      const send = vi.fn().mockRejectedValue(pushError(status));
      const result = await sendToUser(userId, PAYLOAD, send as never);

      expect(result).toEqual({ sent: 0, pruned: 0, failed: 1 });
      // Still there — a rate limit is not a dead device.
      expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);
    }
  });

  it("keeps the row on a network error with no status at all", async () => {
    await addDevice(PHONE);
    const send = vi.fn().mockRejectedValue(new Error("socket hang up"));

    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result.failed).toBe(1);
    expect(result.pruned).toBe(0);
    expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);
  });

  it("counts failures on the row so a persistently bad device is visible", async () => {
    await addDevice(PHONE);
    const send = vi.fn().mockRejectedValue(pushError(500));

    await sendToUser(userId, PAYLOAD, send as never);
    await sendToUser(userId, PAYLOAD, send as never);

    const stored = await PushSubscription.findOne({ endpoint: PHONE }).lean();
    expect(stored?.failureCount).toBe(2);
    expect(stored?.lastFailureAt).not.toBeNull();
  });

  it("resets the failure count after a success", async () => {
    await addDevice(PHONE);
    await sendToUser(userId, PAYLOAD, vi.fn().mockRejectedValue(pushError(500)) as never);
    await sendToUser(userId, PAYLOAD, vi.fn().mockResolvedValue(undefined) as never);

    const stored = await PushSubscription.findOne({ endpoint: PHONE }).lean();
    expect(stored?.failureCount).toBe(0);
    expect(stored?.lastSuccessAt).not.toBeNull();
  });

  it("one dead device does not stop the batch — three devices, middle one gone", async () => {
    await addDevice(PHONE);
    await addDevice(LAPTOP);
    await addDevice("https://fcm.googleapis.com/fcm/send/tablet");

    const send = vi.fn(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint === LAPTOP) throw pushError(410);
      return undefined;
    });

    const result = await sendToUser(userId, PAYLOAD, send as never);

    expect(result).toEqual({ sent: 2, pruned: 1, failed: 0 });
    expect(await PushSubscription.countDocuments({})).toBe(2);
  });
});

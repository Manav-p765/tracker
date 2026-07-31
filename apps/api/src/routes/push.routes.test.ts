import { describe, expect, it } from "vitest";

import { PushSubscription } from "@tracker/db";
import { request, signUpAndIn, type Session } from "../test/helpers.js";

let session: Session;
let other: Session;

async function signIn(): Promise<void> {
  session = await signUpAndIn({ email: "push@tracker.local" });
  other = await signUpAndIn({ email: "push-other@tracker.local" });
}

const auth = () => `Bearer ${session.accessToken}`;

/** A well-formed subscription, shaped exactly like PushSubscription.toJSON(). */
const subscription = (endpoint: string) => ({
  endpoint,
  keys: {
    p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkOMgXQfXlpjNZ8yhSjJ_Pt1KRLxHqmc",
    auth: "8eDyX_uCN0XRhSbY5hs7Hg",
  },
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7)",
  timezone: "Asia/Kolkata",
});

const PHONE = "https://fcm.googleapis.com/fcm/send/phone-endpoint-aaa";
const LAPTOP = "https://fcm.googleapis.com/fcm/send/laptop-endpoint-bbb";

const subscribe = (endpoint: string, token = auth()) =>
  request().post("/api/push/subscribe").set("Authorization", token).send(subscription(endpoint));

describe("push subscription routes", () => {
  it("serves the VAPID public key without auth, and never the private one", async () => {
    const response = await request().get("/api/push/vapid-public-key").expect(200);

    const { publicKey } = response.body.data;
    // An uncompressed P-256 point in base64url: 87 chars, leading "B".
    expect(publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    expect(JSON.stringify(response.body)).not.toContain("privateKey");
    expect(JSON.stringify(response.body)).not.toContain(process.env.VAPID_PRIVATE_KEY ?? "@@none@@");
  });

  it("requires auth on everything else", async () => {
    await signIn();
    await request().get("/api/push/status").expect(401);
    await request().post("/api/push/subscribe").send(subscription(PHONE)).expect(401);
    await request().delete("/api/push/subscribe").send({ endpoint: PHONE }).expect(401);
  });

  it("stores a subscription and reports it in status", async () => {
    await signIn();

    const before = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(before.body.data).toMatchObject({ subscribed: false, deviceCount: 0 });

    await subscribe(PHONE).expect(201);

    const after = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(after.body.data).toMatchObject({ subscribed: true, deviceCount: 1 });
    expect(after.body.data.endpoints).toEqual([PHONE]);
  });

  it("UPSERTS on the same endpoint — re-subscribing never duplicates", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);
    await subscribe(PHONE).expect(201);
    await subscribe(PHONE).expect(201);

    expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);
    const status = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(status.body.data.deviceCount).toBe(1);
  });

  it("refreshes the keys when a device re-subscribes with new ones", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);

    await request()
      .post("/api/push/subscribe")
      .set("Authorization", auth())
      .send({
        ...subscription(PHONE),
        keys: { p256dh: "BRotatedKeyRotatedKeyRotatedKeyRotated", auth: "rotatedAuthValue" },
      })
      .expect(201);

    const stored = await PushSubscription.findOne({ endpoint: PHONE }).lean();
    expect(stored?.keys.auth).toBe("rotatedAuthValue");
    expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);
  });

  it("keeps one row PER DEVICE — two endpoints, one user, two rows", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);
    await subscribe(LAPTOP).expect(201);

    const status = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(status.body.data.deviceCount).toBe(2);
    expect(new Set(status.body.data.endpoints)).toEqual(new Set([PHONE, LAPTOP]));
  });

  it("deletes exactly one device and leaves the other subscribed", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);
    await subscribe(LAPTOP).expect(201);

    const removed = await request()
      .delete("/api/push/subscribe")
      .set("Authorization", auth())
      .send({ endpoint: PHONE })
      .expect(200);
    expect(removed.body.data.removed).toBe(1);

    const status = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(status.body.data).toMatchObject({ subscribed: true, deviceCount: 1 });
    expect(status.body.data.endpoints).toEqual([LAPTOP]);
  });

  it("turning off the last device flips status back to not subscribed", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);
    await request()
      .delete("/api/push/subscribe")
      .set("Authorization", auth())
      .send({ endpoint: PHONE })
      .expect(200);

    const status = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    expect(status.body.data).toMatchObject({ subscribed: false, deviceCount: 0 });
  });

  it("deleting an endpoint that is already gone is a success, not a 404", async () => {
    await signIn();
    // The client unsubscribes locally then calls this; a half-done teardown must
    // not leave the UI stuck.
    const response = await request()
      .delete("/api/push/subscribe")
      .set("Authorization", auth())
      .send({ endpoint: PHONE })
      .expect(200);
    expect(response.body.data.removed).toBe(0);
  });

  it("never lets one user delete another user's device", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);

    const response = await request()
      .delete("/api/push/subscribe")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ endpoint: PHONE })
      .expect(200);

    expect(response.body.data.removed).toBe(0);
    expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);
  });

  it("never shows one user another user's devices", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);

    const theirs = await request()
      .get("/api/push/status")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .expect(200);
    expect(theirs.body.data).toMatchObject({ subscribed: false, deviceCount: 0 });
  });

  it("reassigns a shared device to whoever subscribed last", async () => {
    await signIn();
    await subscribe(PHONE).expect(201);
    // Same browser, second account signs in. The endpoint must follow them, or the
    // next push to that device would reach the wrong person.
    await subscribe(PHONE, `Bearer ${other.accessToken}`).expect(201);

    expect(await PushSubscription.countDocuments({ endpoint: PHONE })).toBe(1);

    const first = await request().get("/api/push/status").set("Authorization", auth()).expect(200);
    const second = await request()
      .get("/api/push/status")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .expect(200);

    expect(first.body.data.subscribed).toBe(false);
    expect(second.body.data.subscribed).toBe(true);
  });

  it("rejects malformed payloads with VALIDATION_FAILED", async () => {
    await signIn();

    const bad: Record<string, unknown>[] = [
      {},
      { endpoint: PHONE }, // no keys
      { endpoint: "not-a-url", keys: { p256dh: "abc", auth: "def" } },
      { endpoint: PHONE, keys: { p256dh: "abc" } }, // no auth
      { endpoint: PHONE, keys: { p256dh: "", auth: "def" } },
      // Standard base64 with + and / is not what the Push API emits.
      { endpoint: PHONE, keys: { p256dh: "abc+def/ghi=", auth: "def" } },
    ];

    for (const body of bad) {
      const response = await request()
        .post("/api/push/subscribe")
        .set("Authorization", auth())
        .send(body)
        .expect(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    }

    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  it("rejects an unsubscribe with no endpoint", async () => {
    await signIn();
    await request()
      .delete("/api/push/subscribe")
      .set("Authorization", auth())
      .send({})
      .expect(422);
  });
});

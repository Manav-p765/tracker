/**
 * Manual reminder trigger — the only way to test real delivery.
 *
 * Actual push delivery needs a live FCM endpoint from a real phone, which no
 * headless test can produce. This bypasses the scan and the queue entirely and
 * sends straight to a user's devices, so the round trip (worker → FCM → phone →
 * notificationclick → /checkin) can be checked by hand.
 *
 *   pnpm --filter @tracker/worker trigger <email> [checkin|goal|streak]
 *
 * It reports what it found before sending, so a silent no-op is never mistaken
 * for a delivery failure.
 */

import { PushSubscription, User } from "@tracker/db";
import { notificationTag, type ReminderKind } from "@tracker/shared";
import mongoose from "mongoose";

import { loadEnv } from "../env.js";
import { configureWebPush, sendToUser } from "../reminders/sender.js";

const COPY: Record<string, { title: string; body: string; url: string }> = {
  checkin: {
    title: "Evening check-in",
    body: "Time for your evening check-in.",
    url: "/checkin",
  },
  goal: { title: "Due today", body: "A goal is due today.", url: "/goals/daily" },
  streak: {
    title: "Streak at risk",
    body: "Tonight's check-in keeps your streak.",
    url: "/checkin",
  },
};

async function main(): Promise<void> {
  const [email, kindArg = "checkin"] = process.argv.slice(2);

  if (email === undefined) {
    process.stdout.write(
      "usage: pnpm --filter @tracker/worker trigger <email> [checkin|goal|streak]\n",
    );
    process.exit(1);
  }

  const payload = COPY[kindArg];
  if (payload === undefined) {
    process.stdout.write(`unknown kind "${kindArg}" — expected checkin, goal or streak\n`);
    process.exit(1);
  }

  const env = loadEnv();
  configureWebPush(env);
  await mongoose.connect(env.MONGODB_URI);

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (user === null) {
    process.stdout.write(`no user with email ${email}\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const devices = await PushSubscription.find({ userId: user._id }).lean();
  process.stdout.write(`user      ${user.email}  (${user.timezone})\n`);
  process.stdout.write(`devices   ${devices.length}\n`);
  for (const device of devices) {
    process.stdout.write(`          ${device.endpoint.slice(0, 60)}…\n`);
  }

  if (devices.length === 0) {
    process.stdout.write("\nNothing to send to. Turn reminders on from the phone first.\n");
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = await sendToUser(String(user._id), {
    ...payload,
    tag: notificationTag(kindArg as ReminderKind),
  });

  process.stdout.write(
    `\nsent ${result.sent}  pruned ${result.pruned}  failed ${result.failed}\n`,
  );
  if (result.pruned > 0) {
    process.stdout.write("(pruned endpoints were dead — 404/410 from the push service)\n");
  }

  await mongoose.disconnect();
  process.exit(result.sent > 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});

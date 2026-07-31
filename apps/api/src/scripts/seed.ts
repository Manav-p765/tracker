/**
 * Seeds the single user (Prompt 0.2 §6).
 *
 * Idempotent: run it twice and the second run updates the password rather than
 * failing on the unique email index. Also builds every declared index, so a fresh
 * database is fully constrained before the first write.
 *
 *   pnpm --filter @tracker/api seed
 *   SEED_EMAIL=me@example.com SEED_PASSWORD='…' pnpm --filter @tracker/api seed
 */

import { connectToDatabase, disconnectFromDatabase, syncIndexes } from "../db.js";
import { logger } from "../logger.js";
import { User } from "@tracker/db";
import { hashPassword } from "../services/auth.service.js";

const email = (process.env.SEED_EMAIL ?? "me@tracker.local").trim().toLowerCase();
const password = process.env.SEED_PASSWORD ?? "change-me-after-seeding";
const timezone = process.env.SEED_TIMEZONE ?? "Asia/Kolkata";

async function seed(): Promise<void> {
  await connectToDatabase();
  await syncIndexes();

  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: { passwordHash, timezone },
      $setOnInsert: { email, theme: "system", reminderTime: "21:00" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  process.stdout.write(
    [
      "",
      "  seeded user",
      `  email    ${email}`,
      `  id       ${String(user?._id)}`,
      `  timezone ${timezone}`,
      password === "change-me-after-seeding"
        ? "  password change-me-after-seeding  ← set SEED_PASSWORD and re-run"
        : "  password (from SEED_PASSWORD)",
      "",
    ].join("\n"),
  );
}

seed()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error("seed failed", { message: error instanceof Error ? error.message : String(error) });
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });

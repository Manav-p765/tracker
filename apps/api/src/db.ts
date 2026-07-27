/**
 * Mongoose connection with retry (ARCHITECTURE.md §1).
 *
 * Retries with linear backoff on boot — a container that starts before Mongo is
 * ready should wait, not crash-loop. After the last attempt it gives up and lets
 * the caller exit non-zero.
 */

import mongoose from "mongoose";

import { env, isTestEnv } from "./env.js";
import { logger } from "./logger.js";

const MAX_ATTEMPTS = isTestEnv ? 1 : 8;
const BASE_DELAY_MS = 1_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectToDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  // Fail loudly on a query against an undeclared path rather than silently
  // dropping it — every field in this app is declared in ARCHITECTURE.md §3.
  mongoose.set("strictQuery", true);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5_000,
        // Indexes are declared in the models; build them on connect outside
        // production, where a migration step owns them instead.
        autoIndex: env.NODE_ENV !== "production",
      });
      logger.info("mongo connected", { attempt });
      return;
    } catch (error) {
      const last = attempt === MAX_ATTEMPTS;
      logger.error("mongo connection failed", {
        attempt,
        willRetry: !last,
        message: error instanceof Error ? error.message : String(error),
      });
      if (last) throw error;
      await sleep(BASE_DELAY_MS * attempt);
    }
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close();
}

/** Build every declared index. Called by the seed script and by tests. */
export async function syncIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

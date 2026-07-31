/**
 * Per-file test lifecycle: connect to the in-memory Mongo, build the real indexes,
 * and wipe every collection between tests.
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";

// Registers all ten schemas.
import "@tracker/db";

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined) throw new Error("global-setup did not provide MONGODB_URI");
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});

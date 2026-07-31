/**
 * Per-file test lifecycle: connect to the in-memory Mongo, build the real
 * indexes, and wipe every collection between tests so no test can depend on
 * another's leftovers.
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";

import { connectToDatabase, disconnectFromDatabase, syncIndexes } from "../db.js";
// Registers all ten schemas.
import "@tracker/db";

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined) {
    throw new Error("global-setup did not provide MONGODB_URI");
  }
  await connectToDatabase(uri);
  // Unique indexes matter to these tests (email, {userId,date}) — build them.
  await syncIndexes();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnectFromDatabase();
});

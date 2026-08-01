/**
 * Starts one in-memory MongoDB for the whole suite.
 *
 * There is no local mongod on the dev machine, and a test suite should not need
 * one: mongodb-memory-server downloads a real mongod binary once and runs it on a
 * random port. The tests therefore exercise real indexes, real unique
 * constraints and real update operators — not a mock.
 */

import { MongoMemoryServer } from "mongodb-memory-server";

let mongo: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  mongo = await MongoMemoryServer.create({ instance: { dbName: "tracker-test" } });
  process.env.MONGODB_URI = mongo.getUri("tracker-test");
}

export async function teardown(): Promise<void> {
  await mongo?.stop();
}

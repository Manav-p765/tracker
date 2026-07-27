/**
 * Starts a local mongod on 127.0.0.1:27017 for development.
 *
 * There is no MongoDB installed on this machine and the Docker daemon is not
 * running, so this reuses the real mongod binary that mongodb-memory-server
 * downloads for the test suite. Data persists between runs.
 *
 *   pnpm --filter @tracker/api mongo:dev     # leave running in its own terminal
 *
 * The data directory lives OUTSIDE the repo on purpose: mongod holds its
 * WiredTiger files locked, and Turbo — which hashes every file in a package to
 * decide what to rebuild — fails with an I/O error if it meets one.
 *
 * Replace with Mongo Atlas or a container whenever either is available; nothing
 * in the app depends on this script.
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = process.env.DEV_MONGO_DB_PATH ?? join(tmpdir(), "tracker-mongo-data");
mkdirSync(dbPath, { recursive: true });

const mongo = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    ip: "127.0.0.1",
    dbName: "tracker",
    dbPath,
    storageEngine: "wiredTiger",
  },
});

process.stdout.write(`\n  mongod listening — ${mongo.getUri("tracker")}\n  data: ${dbPath}\n  ctrl-c to stop\n\n`);

const stop = async () => {
  await mongo.stop({ doCleanup: false });
  process.exit(0);
};

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

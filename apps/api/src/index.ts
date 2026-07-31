/**
 * API entry point (ARCHITECTURE.md §1).
 *
 * Order matters: env is validated on import, then Sentry, then Mongo (with
 * retry), and only then does the HTTP server start accepting traffic.
 */

import { createServer } from "node:http";

import { createApp } from "./app.js";
import { connectToDatabase, disconnectFromDatabase } from "./db.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
// Registers all ten schemas before the first query.
import "@tracker/db";
import { closeSocketServer, createSocketServer } from "./realtime/socket.js";
import { initSentry } from "./sentry.js";

async function main(): Promise<void> {
  initSentry();

  try {
    await connectToDatabase();
  } catch {
    logger.error("could not reach mongo — exiting");
    process.exit(1);
  }

  const app = createApp();
  const httpServer = createServer(app);
  createSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info("api listening", { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutting down", { signal });
    // Stop accepting new work, then let in-flight requests finish.
    httpServer.close();
    await closeSocketServer();
    await disconnectFromDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();

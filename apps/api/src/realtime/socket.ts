/**
 * Socket.IO (ARCHITECTURE.md §6).
 *
 * Notify-only: the server emits after a successful REST write so other devices
 * patch their cache. The client sends nothing but the implicit room join, which
 * keeps validation to a single path.
 */

import type {
  ClientToServerEvents,
  Id,
  ServerToClientEvents,
} from "@tracker/shared";
import { userRoom } from "@tracker/shared";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import { corsOrigins } from "../env.js";
import { logger } from "../logger.js";
import { verifyAccessToken } from "../services/token.service.js";

interface SocketData {
  userId: string;
}

export type TrackerServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type TrackerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

let io: TrackerServer | null = null;

/** Reads the access token from the handshake — `auth.token` first, then a header. */
function extractToken(socket: TrackerSocket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return undefined;
}

export function createSocketServer(httpServer: HttpServer): TrackerServer {
  const server: TrackerServer = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: corsOrigins, credentials: true },
    // The browser reconnects on its own; keep the window tight.
    pingTimeout: 20_000,
  });

  // Handshake auth. An unauthenticated socket is rejected, never downgraded to a
  // read-only connection — there is no such thing here.
  server.use((socket, next) => {
    const token = extractToken(socket);
    if (token === undefined) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    try {
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  server.on("connection", (socket) => {
    const { userId } = socket.data;
    void socket.join(userRoom(userId));
    logger.debug("socket connected", { userId, socketId: socket.id });

    socket.on("disconnect", (reason) => {
      logger.debug("socket disconnected", { userId, socketId: socket.id, reason });
    });
  });

  io = server;
  return server;
}

/**
 * Emit to every device of one user. Typed against ServerToClientEvents, so a
 * wrong payload is a compile error rather than a silent no-op on the client.
 */
export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: Id,
  event: E,
  ...payload: Parameters<ServerToClientEvents[E]>
): void {
  if (io === null) {
    // Realtime is an enhancement; a write must never fail because the socket
    // server is not up (during tests, or a worker-side write).
    logger.debug("emit skipped — socket server not initialised", { event: String(event) });
    return;
  }
  io.to(userRoom(userId)).emit(event, ...payload);
}

export const getSocketServer = (): TrackerServer | null => io;

export async function closeSocketServer(): Promise<void> {
  if (io === null) return;
  await io.close();
  io = null;
}

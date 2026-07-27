/**
 * Socket.IO client singleton (ARCHITECTURE.md §6, §7).
 *
 * One connection per tab, authenticated with the in-memory access token. The
 * server is notify-only, so this module never emits — it listens and hands
 * payloads to whoever registered a handler.
 *
 * If the handshake is rejected because the access token expired, it refreshes
 * once and reconnects. Any further failure is left to socket.io's own backoff.
 */

import type { ServerToClientEvents } from "@tracker/shared";
import { io, type Socket } from "socket.io-client";

import { getAccessToken, refreshSession } from "./api";

type TrackerSocket = Socket<ServerToClientEvents, Record<string, never>>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: TrackerSocket | null = null;
let retriedAfterRefresh = false;

export function getSocket(): TrackerSocket {
  if (socket !== null) return socket;

  socket = io(SOCKET_URL, {
    path: "/socket.io",
    transports: ["websocket"],
    autoConnect: false,
    auth: (callback: (data: { token: string | null }) => void) => {
      // Read the token at connect time, not at module load — it changes on every
      // refresh.
      callback({ token: getAccessToken() });
    },
  }) as TrackerSocket;

  socket.on("connect_error", (error) => {
    if (error.message !== "UNAUTHORIZED" || retriedAfterRefresh) return;
    retriedAfterRefresh = true;
    void refreshSession().then((token) => {
      if (token !== null) socket?.connect();
    });
  });

  socket.on("connect", () => {
    retriedAfterRefresh = false;
  });

  return socket;
}

export function connectSocket(): TrackerSocket {
  const client = getSocket();
  if (!client.connected) client.connect();
  return client;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
  retriedAfterRefresh = false;
}

/**
 * Subscribe to one server event. Returns an unsubscribe function, so a component
 * can register in an effect and clean up on unmount.
 */
export function onSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): () => void {
  const client = getSocket();
  client.on(event, handler as never);
  return () => {
    client.off(event, handler as never);
  };
}

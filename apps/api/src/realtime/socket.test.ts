import { userRoom } from "@tracker/shared";
import { createServer, type Server as HttpServer } from "node:http";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { signUpAndIn, type Session } from "../test/helpers.js";
import { closeSocketServer, createSocketServer, emitToUser, type TrackerServer } from "./socket.js";

let httpServer: HttpServer;
let io: TrackerServer;
let url: string;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  httpServer = createServer(createApp());
  io = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  url = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await closeSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function client(token?: string): ClientSocket {
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    ...(token === undefined ? {} : { auth: { token } }),
  });
  clients.push(socket);
  return socket;
}

const connected = (socket: ClientSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (error) => reject(error));
  });

describe("socket handshake auth", () => {
  let session: Session;

  beforeEach(async () => {
    session = await signUpAndIn();
  });

  it("accepts a valid access token and joins the user's room", async () => {
    const socket = client(session.accessToken);
    await connected(socket);

    expect(socket.connected).toBe(true);

    // The room is the emit target for every server-side notification.
    const room = io.sockets.adapter.rooms.get(userRoom(session.userId));
    expect(room?.size).toBe(1);
  });

  it("rejects a socket with no token", async () => {
    await expect(connected(client())).rejects.toThrow("UNAUTHORIZED");
  });

  it("rejects a forged token", async () => {
    await expect(connected(client("eyJhbGciOiJIUzI1NiJ9.e30.nope"))).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });

  it("rejects a refresh token presented as an access token", async () => {
    await expect(connected(client(session.refreshToken))).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("emitToUser", () => {
  it("delivers only to the addressed user's room", async () => {
    const mine = await signUpAndIn({ email: "mine@tracker.local" });
    const other = await signUpAndIn({ email: "other@tracker.local" });

    const mineSocket = client(mine.accessToken);
    const otherSocket = client(other.accessToken);
    await Promise.all([connected(mineSocket), connected(otherSocket)]);

    const received: string[] = [];
    otherSocket.on("push:test", () => received.push("other"));

    const delivered = new Promise<{ sentAt: string }>((resolve) => {
      mineSocket.on("push:test", resolve);
    });

    emitToUser(mine.userId, "push:test", { sentAt: "2026-07-26T21:00:00.000Z" });

    await expect(delivered).resolves.toEqual({ sentAt: "2026-07-26T21:00:00.000Z" });
    expect(received).toEqual([]);
  });
});

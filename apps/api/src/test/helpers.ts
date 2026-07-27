/**
 * Test helpers: a supertest agent over the real app, and cookie plumbing so the
 * refresh flow can be exercised exactly as a browser would drive it.
 */

import type { Express } from "express";
import supertest from "supertest";

import { createApp } from "../app.js";
import { REFRESH_COOKIE } from "../controllers/auth.controller.js";

export const app: Express = createApp();
export const request = () => supertest(app);

export const TEST_USER = {
  email: "me@tracker.local",
  password: "a-long-enough-password",
  name: "Me",
  timezone: "Asia/Kolkata",
} as const;

/** Pulls the refresh cookie value out of a Set-Cookie header list. */
export function readRefreshCookie(setCookie: string[] | string | undefined): string | undefined {
  if (setCookie === undefined) return undefined;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of headers) {
    const match = new RegExp(`^${REFRESH_COOKIE}=([^;]*)`).exec(header);
    if (match?.[1] !== undefined && match[1].length > 0) return match[1];
  }
  return undefined;
}

export const setCookieHeader = (response: {
  headers: Record<string, unknown>;
}): string[] | undefined => {
  const raw = response.headers["set-cookie"];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
};

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface Credentials {
  email?: string;
  password?: string;
  name?: string;
  timezone?: string;
}

/** Registers and logs in, returning a usable session. */
export async function signUpAndIn(overrides: Credentials = {}): Promise<Session> {
  const credentials = { ...TEST_USER, ...overrides };

  await request().post("/api/auth/register").send(credentials).expect(201);

  const login = await request()
    .post("/api/auth/login")
    .send({ email: credentials.email, password: credentials.password })
    .expect(200);

  const refreshToken = readRefreshCookie(setCookieHeader(login));
  if (refreshToken === undefined) throw new Error("login did not set a refresh cookie");

  return {
    userId: login.body.data.user._id as string,
    accessToken: login.body.data.accessToken as string,
    refreshToken,
  };
}

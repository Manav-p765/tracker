/**
 * Auth controllers (ARCHITECTURE.md §4).
 *
 * Controllers marshal HTTP only — cookies, status codes, the { data } envelope.
 * Every rule lives in services/.
 */

import type { LoginInput, RegisterInput, UpdateMeInput } from "@tracker/shared";
import type { Request, Response } from "express";

import { isProduction } from "../env.js";
import { AppError } from "../errors.js";
import { currentUserId } from "../middleware/require-auth.js";
import {
  getUserById,
  registerUser,
  toUserDto,
  updateUser,
  verifyCredentials,
} from "../services/auth.service.js";
import {
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken,
  type IssuedTokens,
} from "../services/token.service.js";

export const REFRESH_COOKIE = "tracker_rt";

/**
 * httpOnly so script cannot read it, SameSite=Lax so it rides same-site requests
 * (localhost:3000 → localhost:4000 is same-site; so is app.example.com →
 * api.example.com) but never a cross-site one. `secure` is off in dev because
 * dev is http://localhost.
 *
 * Path is scoped to the two endpoints that need it, so the cookie is not attached
 * to every API call.
 */
const cookieOptions = (expiresAt: Date) =>
  ({
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/api/auth",
    expires: expiresAt,
  });

function setRefreshCookie(res: Response, tokens: IssuedTokens): void {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

const readRefreshCookie = (req: Request): string => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    throw AppError.unauthorized("No refresh cookie");
  }
  return token;
};

export async function register(req: Request, res: Response): Promise<void> {
  const input = req.body as RegisterInput;
  const user = await registerUser(input);
  // Registering does not sign you in — the client posts to /auth/login next, so
  // there is exactly one place that mints tokens.
  res.status(201).json({ data: { user } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const user = await verifyCredentials(email, password);
  const tokens = await issueTokenPair(user._id, req.get("user-agent"));

  setRefreshCookie(res, tokens);
  res.json({ data: { accessToken: tokens.accessToken, user: toUserDto(user) } });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const presented = readRefreshCookie(req);

  let tokens: IssuedTokens;
  try {
    tokens = await rotateRefreshToken(presented, req.get("user-agent"));
  } catch (error) {
    // A dead or replayed cookie is worthless — drop it so the browser stops
    // sending it and the client falls through to the login screen.
    clearRefreshCookie(res);
    throw error;
  }

  setRefreshCookie(res, tokens);
  res.json({ data: { accessToken: tokens.accessToken } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    await revokeRefreshToken(token);
  }
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await getUserById(currentUserId(req));
  res.json({ data: { user } });
}

export async function patchMe(req: Request, res: Response): Promise<void> {
  const user = await updateUser(currentUserId(req), req.body as UpdateMeInput);
  res.json({ data: { user } });
}

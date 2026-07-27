import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isTestEnv } from "../env.js";
import { AppError, ERROR_CODES } from "../errors.js";

/**
 * Rate limiting (ARCHITECTURE.md §4) — a generous global cap, and a tight one on
 * /auth/* so credential stuffing is expensive.
 *
 * Disabled under NODE_ENV=test: the suite makes dozens of auth calls on purpose,
 * and a 429 there would be testing the limiter rather than the auth flow.
 */

const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};

const limitReached = () => {
  throw new AppError(ERROR_CODES.RATE_LIMITED, 429, "Too many requests — try again shortly");
};

const make = (windowMs: number, limit: number): RequestHandler =>
  isTestEnv
    ? passthrough
    : (rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        // Route through the app's error envelope instead of the default body.
        handler: limitReached,
      }) as RateLimitRequestHandler);

/** Everything: 600 requests / 15 min. A single user syncing devices stays well under. */
export const globalLimiter = make(15 * 60 * 1000, 600);

/** Login and register: 10 attempts / 15 min. */
export const authLimiter = make(15 * 60 * 1000, 10);

/** Refresh is called by every tab on wake, so it gets more room than login. */
export const refreshLimiter = make(15 * 60 * 1000, 120);

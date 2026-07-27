import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors.js";
import { verifyAccessToken } from "../services/token.service.js";

/**
 * Bearer-token gate (ARCHITECTURE.md §4). Puts `userId` on the request; every
 * downstream query scopes by it.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get("authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    next(AppError.unauthorized("Missing bearer token"));
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice("Bearer ".length).trim());
    req.userId = claims.sub;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Reads `req.userId` where the route has already passed through requireAuth.
 * Throws rather than returning undefined, so a missing gate is a loud bug and
 * never a query that silently spans every user's data.
 */
export function currentUserId(req: Request): string {
  if (req.userId === undefined) {
    throw AppError.internal("Route is missing requireAuth");
  }
  return req.userId;
}

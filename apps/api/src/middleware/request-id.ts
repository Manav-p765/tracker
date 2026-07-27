import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { logger } from "../logger.js";

/**
 * Assigns a request id and binds a child logger to it, so every line produced
 * while handling a request carries the same `requestId` (ARCHITECTURE.md §10).
 *
 * Honours an inbound X-Request-Id so a trace can be followed across services.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get("x-request-id");
  const id = inbound !== undefined && inbound.length <= 200 ? inbound : randomUUID();

  req.id = id;
  req.log = logger.child({ requestId: id });
  res.setHeader("X-Request-Id", id);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    req.log.http("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });

  next();
}

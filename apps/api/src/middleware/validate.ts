import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

import { AppError } from "../errors.js";

/**
 * Zod validation at the route edge (ARCHITECTURE.md §10). Schemas come from
 * @tracker/shared so the client and the server share one definition.
 *
 * The parsed value REPLACES the raw one, so handlers see coerced, trimmed,
 * stripped data — an unknown key never reaches a Mongo update.
 */
export interface ValidationTargets {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ["body", "query", "params"] as const) {
      const schema = targets[key];
      if (schema === undefined) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        next(
          AppError.badRequest(
            `Invalid request ${key}`,
            result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        );
        return;
      }
      // req.query/params are getters on Express 5; assign through a cast.
      (req as unknown as Record<string, unknown>)[key] = result.data;
    }
    next();
  };
}

/** Convenience for typed handlers: `const body = parsed<typeof schema>(req.body)`. */
export type Parsed<T extends ZodTypeAny> = z.infer<T>;

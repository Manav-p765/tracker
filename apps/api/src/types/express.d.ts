import type { Logger } from "winston";

/**
 * Request augmentations set by our own middleware.
 *
 * `userId` is populated by requireAuth and is the scope for EVERY query in this
 * app — ARCHITECTURE.md §3: "Every query is scoped by userId. No exceptions."
 */
declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      /** Present only after requireAuth has run. */
      userId?: string;
    }
  }
}

export {};

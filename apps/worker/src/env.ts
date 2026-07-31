import "dotenv/config";
import { z } from "zod";

/**
 * Worker env (ARCHITECTURE.md §9). Fails fast: a worker that boots without VAPID
 * keys would run happily and deliver nothing.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1).default("mailto:tracker@localhost"),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  /** How often the sweep runs, in minutes. Must be ≤ the narrowest scan window. */
  SCAN_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
});

export type WorkerEnv = z.infer<typeof schema>;

export function loadEnv(): WorkerEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid worker environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

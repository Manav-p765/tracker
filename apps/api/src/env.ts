/**
 * Environment (ARCHITECTURE.md §9).
 *
 * Validated once at import with Zod. A missing or malformed var fails fast and
 * exits non-zero — the process never boots half-configured.
 */

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const isTest = process.env.NODE_ENV === "test";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),

  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -base64 48)"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -base64 48)"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  /** Comma-separated allowlist. */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),

  /**
   * Not read until Prompt 2.2 (the worker sends the pushes), so they stay
   * optional here rather than blocking the API from booting in Phase 0.
   */
  REDIS_URL: z.string().optional(),
  /** Shared secret for POST /internal/cron/dispatch-reminders. */
  CRON_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

function loadEnv() {
  // Tests inject their own in-memory Mongo URI and throwaway secrets.
  const source = isTest
    ? {
        ...process.env,
        MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/tracker-test",
        JWT_ACCESS_SECRET:
          process.env.JWT_ACCESS_SECRET ?? "test-access-secret-test-access-secret-000",
        JWT_REFRESH_SECRET:
          process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-test-refresh-secret-0",
      }
    : process.env;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // No logger yet — this runs before anything is wired up.
    process.stderr.write(`Invalid environment:\n${details}\n\nSee .env.example\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTestEnv = env.NODE_ENV === "test";

/** The CORS allowlist, parsed once. */
export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

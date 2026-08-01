import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // One in-memory Mongo per file, and argon2 hashing is deliberately slow.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      TZ: "UTC",
      LOG_LEVEL: "error",
      // The cron endpoint refuses to run at all without a configured secret, so
      // the auth tests need one present to reach the 401 path they are testing.
      CRON_SECRET: "test-cron-secret",
    },
  },
});

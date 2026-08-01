import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Mongo spin-up plus a scan over a month of fixtures.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One Mongo instance, shared: parallel suites would race on the same db.
    fileParallelism: false,
    env: { TZ: "UTC" },
  },
});

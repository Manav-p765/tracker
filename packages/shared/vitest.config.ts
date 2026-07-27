import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The day-key tests assert that a UTC *server* and an Asia/Kolkata *user*
    // disagree about what day it is. Pinning TZ=UTC here makes that explicit
    // rather than dependent on whoever's laptop runs the suite.
    env: { TZ: "UTC" },
  },
});

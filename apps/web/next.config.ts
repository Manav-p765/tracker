import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/**
 * Serwist compiles app/sw.ts → public/sw.js at build time and injects the
 * precache manifest (ARCHITECTURE.md §8). Disabled in dev so a stale worker
 * never shadows a code change.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Lint is its own task in the turbo pipeline; don't run it twice.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // @tracker/shared ships real ESM from dist/, so nothing to transpile.
    optimizePackageImports: ["@tracker/shared"],
  },
};

export default withSerwist(nextConfig);

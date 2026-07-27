import type { MetadataRoute } from "next";

import { PAPER_DAY } from "@/lib/theme-color";

/**
 * Installable Android PWA (ARCHITECTURE.md §8). Portrait, standalone, bone
 * background so the splash screen is paper rather than white.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tracker",
    short_name: "tracker",
    description: "A dot-grid journal for goals, habits and the daily check-in.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PAPER_DAY,
    theme_color: PAPER_DAY,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

/// <reference lib="webworker" />

/**
 * Service worker (ARCHITECTURE.md §8).
 *
 * Compiled by Serwist at build time into public/sw.js with the precache manifest
 * injected. Typed as a WebWorker via tsconfig.sw.json, not as DOM.
 *
 * Caching contract:
 *   - precache the shell
 *   - NetworkFirst for API GETs
 *   - CacheFirst for fonts and icons
 *   - NEVER cache a mutation. Every matcher below is GET-only, so POST/PUT/PATCH/
 *     DELETE fall straight through to the network and can never be served stale.
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      /**
       * API reads. Matched by pathname so it holds for the cross-origin API host
       * too, and gated on GET so writes are never cached.
       */
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "tracker-api",
        networkTimeoutSeconds: 8,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    {
      // Self-hosted next/font files — immutable, so cache-first forever.
      matcher: ({ request }) => request.method === "GET" && request.destination === "font",
      handler: new CacheFirst({
        cacheName: "tracker-fonts",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: YEAR_IN_SECONDS }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname.startsWith("/icons/"),
      handler: new CacheFirst({
        cacheName: "tracker-icons",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: YEAR_IN_SECONDS }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

/**
 * TODO(Prompt 2.1): replace this stub with the real push pipeline —
 *   - `push`                   → showNotification with a tag per reminder kind
 *                                (notificationTag() in @tracker/shared), so an
 *                                unread evening reminder is replaced, not stacked
 *   - `notificationclick`      → focus an existing client if one exists, else
 *                                openWindow the deep link (/checkin, /goals/:id,
 *                                /events)
 *   - `pushsubscriptionchange` → re-subscribe and re-POST to
 *                                /api/push/subscriptions
 *
 * Until then this listener is intentionally inert: no subscription exists yet
 * (the permission gate ships in Prompt 2.1), so nothing can arrive here.
 */
self.addEventListener("push", () => {
  // no-op until Prompt 2.1
});

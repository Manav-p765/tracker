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

/** Provided by the bundler's define step, not by a Node runtime. */
declare const process: { env: { NEXT_PUBLIC_API_URL?: string } };

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** Inlined at build time by the bundler — the SW has no runtime env. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

/* ---------------------------------------------------------------------------
 * Push (ARCHITECTURE.md §8)
 *
 * These listeners must EXIST for a subscription to be meaningful — a browser will
 * happily hand out a subscription with no push handler, and then every message
 * either does nothing or triggers Chrome's "This site has been updated in the
 * background" notice. Prompt 2.2 fills in the payload shapes and the deep links it
 * sends; the handling below is already correct for them.
 * ------------------------------------------------------------------------- */

interface PushPayload {
  title?: string;
  body?: string;
  /** One tag per reminder kind, so an unread reminder is replaced, not stacked. */
  tag?: string;
  /** Deep link to open on tap: /checkin, /goals/:id, /events. */
  url?: string;
}

self.addEventListener("push", (event) => {
  // A push with no readable payload still has to show something: on Android a
  // silent push burns the "userVisibleOnly" contract and Chrome shows its own
  // generic notice instead.
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() as PushPayload | undefined) ?? {};
  } catch {
    const text = event.data?.text();
    if (text !== undefined && text !== "") payload = { body: text };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "tracker", {
      body: payload.body ?? "Time to check in.",
      tag: payload.tag ?? "tracker:general",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/checkin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data as { url?: string } | undefined)?.url ?? "/checkin";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus an already-open window rather than stacking another copy of the app.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * The push service can rotate an endpoint without asking. When it does, the stored
 * row is dead — re-subscribe and hand the new one over, or reminders stop silently.
 *
 * Best-effort: the SW has no access token, so this relies on the session cookie
 * being valid. If it fails, the app repairs the subscription on next open.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const change = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
    newSubscription?: PushSubscription;
  };

  event.waitUntil(
    (async () => {
      const applicationServerKey = change.oldSubscription?.options.applicationServerKey;
      if (applicationServerKey === null || applicationServerKey === undefined) return;

      const renewed =
        change.newSubscription ??
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));

      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renewed.toJSON()),
      }).catch(() => undefined);
    })(),
  );
});

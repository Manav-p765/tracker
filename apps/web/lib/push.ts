"use client";

/**
 * The install → permission → subscribe state machine (ARCHITECTURE.md §8).
 *
 * The ordering is the whole point and it is Android-specific: a browser tab is not
 * where you ask for notification permission. You ask **after** the app has been
 * installed and opened, because a permission prompt on a cold visit is the fastest
 * way to get permanently denied — and `denied` cannot be undone from JavaScript.
 *
 * Every state below is reachable and has exactly one honest action. There is no
 * state that renders a button which cannot work.
 */

import { apiFetch } from "./api";

export type PushState =
  /** Still working out where we are. */
  | "CHECKING"
  /** No Push or Notification API at all — desktop Safari, some in-app browsers. */
  | "UNSUPPORTED"
  /** A normal browser tab. Offer install; do NOT ask for permission yet. */
  | "NOT_INSTALLED"
  /** Installed and standalone, permission still 'default'. Offer to turn on. */
  | "INSTALLED_NO_PERMISSION"
  /** Permission 'denied'. Explain; never re-request — the API would no-op anyway. */
  | "PERMISSION_DENIED"
  /** Permission granted and a subscription is stored server-side. Done. */
  | "SUBSCRIBED"
  /** Permission granted but subscribing or storing failed. Offer retry. */
  | "ERROR";

export interface PushStatusResponse {
  subscribed: boolean;
  deviceCount: number;
  endpoints: string[];
}

// ---------------------------------------------------------------------------
// capability + install detection
// ---------------------------------------------------------------------------

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Are we running as an installed app rather than in a tab?
 *
 * Two checks: the standard display-mode query, plus `navigator.standalone`, which
 * is the only signal iOS Safari gives. We target Android, but the iOS fallback
 * costs one line and stops the check being wrong on the platform most likely to
 * report it differently.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  const displayMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;

  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return displayMode || iosStandalone;
}

export function notificationPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

// ---------------------------------------------------------------------------
// VAPID key conversion
// ---------------------------------------------------------------------------

/**
 * URL-safe base64 → Uint8Array, for `applicationServerKey`.
 *
 * The Push API needs the raw 65-byte P-256 point, but VAPID keys travel as
 * URL-safe base64 (`-` and `_` instead of `+` and `/`, padding stripped). Feeding
 * `atob` the URL-safe form directly yields garbage bytes and the subscribe call
 * fails with an opaque InvalidCharacterError, so both substitutions and the
 * padding have to be undone first.
 */
export function urlBase64ToUint8Array(base64UrlString: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");

  const raw = window.atob(base64);
  // Backed by a plain ArrayBuffer on purpose: applicationServerKey takes a
  // BufferSource, and a SharedArrayBuffer-backed view is not assignable to it.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const pushApi = {
  /**
   * Fetched rather than baked into the bundle, so regenerating the keypair does
   * not silently produce subscriptions this server can never push to.
   */
  vapidPublicKey: () =>
    apiFetch<{ publicKey: string }>("/push/vapid-public-key").then((data) => data.publicKey),
  status: () => apiFetch<PushStatusResponse>("/push/status"),
  subscribe: (subscription: PushSubscriptionJSON & { userAgent?: string; timezone?: string }) =>
    apiFetch<{ subscription: { endpoint: string } }>("/push/subscribe", {
      method: "POST",
      body: subscription,
    }),
  unsubscribe: (endpoint: string) =>
    apiFetch<{ removed: number }>("/push/subscribe", {
      method: "DELETE",
      body: { endpoint },
    }),
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration !== undefined) return registration;
  // `ready` resolves once one is active; it never rejects, so race it with a
  // timeout rather than hanging the UI on a worker that failed to install.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("The service worker is not running")), 10_000),
    ),
  ]);
}

/**
 * Ask for permission, subscribe, and store it.
 *
 * Returns the new state rather than throwing on the expected outcomes: a user
 * declining is not an exception. Only genuine failures land in ERROR, and — this
 * is the important part — a failure to subscribe never reports SUBSCRIBED, even
 * though permission was granted.
 */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "UNSUPPORTED";

  const permission = await Notification.requestPermission();
  if (permission === "denied") return "PERMISSION_DENIED";
  if (permission !== "granted") return "INSTALLED_NO_PERMISSION";

  const registration = await readyRegistration();
  const applicationServerKey = urlBase64ToUint8Array(await pushApi.vapidPublicKey());

  // Reuse an existing subscription if the browser already has one for this key —
  // subscribing twice with different keys throws.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  await pushApi.subscribe({
    ...subscription.toJSON(),
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return "SUBSCRIBED";
}

/**
 * Turn reminders off properly.
 *
 * Both halves matter: unsubscribing locally without deleting the row leaves the
 * worker pushing into the void, and deleting the row without unsubscribing leaves
 * the browser holding a live subscription the server has forgotten. The server
 * delete runs even if the local unsubscribe fails, so a partial teardown still
 * stops the notifications.
 */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription !== null && subscription !== undefined) {
    const { endpoint } = subscription;
    try {
      await subscription.unsubscribe();
    } finally {
      await pushApi.unsubscribe(endpoint);
    }
    return;
  }

  // No local subscription: clear whatever this account still has stored, so a
  // reinstalled browser cannot leave an orphan behind.
  const status = await pushApi.status();
  for (const endpoint of status.endpoints) {
    await pushApi.unsubscribe(endpoint);
  }
}

/**
 * Work out which state we are in, asking the server rather than assuming.
 *
 * The server is the authority on SUBSCRIBED: a browser can hold a subscription the
 * server never received (a failed POST), and the UI must not claim reminders are on
 * when nothing will ever be sent.
 */
export async function resolvePushState(): Promise<PushState> {
  if (!isPushSupported()) return "UNSUPPORTED";

  const permission = notificationPermission();
  if (permission === "denied") return "PERMISSION_DENIED";

  if (permission === "granted") {
    const status = await pushApi.status();
    if (!status.subscribed) {
      // Granted but nothing stored — installed-and-ready to finish the job.
      return isStandalone() ? "INSTALLED_NO_PERMISSION" : "NOT_INSTALLED";
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const local = await registration?.pushManager.getSubscription();
    // Stored, but this browser's own endpoint is not among them → another device.
    if (local !== null && local !== undefined && !status.endpoints.includes(local.endpoint)) {
      return isStandalone() ? "INSTALLED_NO_PERMISSION" : "NOT_INSTALLED";
    }
    return "SUBSCRIBED";
  }

  return isStandalone() ? "INSTALLED_NO_PERMISSION" : "NOT_INSTALLED";
}

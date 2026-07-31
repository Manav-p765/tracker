"use client";

/**
 * The Android install prompt (ARCHITECTURE.md §8).
 *
 * Chrome fires `beforeinstallprompt` once, early, and only when it considers the
 * app installable. It must be captured and stashed at that moment or the chance is
 * gone — which is why this listener is registered at module scope rather than
 * inside a component that may not have mounted yet.
 *
 * Chrome also only fires it when it feels like it (engagement heuristics, and never
 * on iOS), so the UI must always have a manual "Add to Home Screen" fallback. A
 * missing event is not an error state.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Stop Chrome's own mini-infobar; we place the affordance ourselves.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const canPromptInstall = (): boolean => deferred !== null;

/** Subscribe to availability changes. Returns an unsubscribe function. */
export function onInstallAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Show the browser's install dialog.
 *
 * Returns false when there is nothing to show, so the caller can fall back to the
 * manual instructions rather than appearing to do nothing.
 */
export async function promptInstall(): Promise<boolean> {
  if (deferred === null) return false;

  const event = deferred;
  // The event is single-use — clear it before awaiting so a double tap cannot
  // call prompt() twice, which throws.
  deferred = null;
  notify();

  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

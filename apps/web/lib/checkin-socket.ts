"use client";

/**
 * Keeps check-ins in step with writes made on another device (ARCHITECTURE.md §6).
 *
 * Patch, never invalidate — same discipline as goals and habits. Because
 * patchCheckinInCache replaces by date rather than appending, the echo of a write
 * this tab just made is a no-op rather than a duplicate.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { patchCheckinInCache } from "./checkins";
import { onSocketEvent } from "./socket";

export function useCheckinSocketSync(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    return onSocketEvent("checkin:changed", ({ checkin }) => {
      patchCheckinInCache(client, checkin);
    });
  }, [client, enabled]);
}

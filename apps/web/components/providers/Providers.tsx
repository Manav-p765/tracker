"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { createQueryClient } from "@/lib/query";
import { SessionProvider, useSession } from "@/lib/session";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { ThemeProvider } from "@/lib/theme";

/**
 * Client providers, outermost first: theme (paints instantly), Query (owns server
 * state), session (restores from the refresh cookie), then the socket, which
 * needs an authenticated session to hand shake with.
 */
export function Providers({ children }: { children: ReactNode }) {
  // One client per mount, never one per render.
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SocketBridge>{children}</SocketBridge>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/**
 * Holds the socket open for as long as there is a session, and drops it on sign
 * out so a stale connection cannot keep receiving another account's events.
 *
 * Prompt 1.2 onwards adds the cache-patching listeners here.
 */
function SocketBridge({ children }: { children: ReactNode }) {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    connectSocket();
    return () => {
      disconnectSocket();
    };
  }, [status]);

  return <>{children}</>;
}

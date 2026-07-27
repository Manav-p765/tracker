import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api";

/**
 * TanStack Query configuration (ARCHITECTURE.md §7).
 *
 * All server state lives here; the socket patches this cache with setQueryData
 * rather than invalidating, so a write on the phone updates a laptop tab without
 * a refetch (Prompt 1.2 onwards).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A journal is not a stock ticker.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry(failureCount, error) {
          // Never retry a 4xx: the request itself is the problem, and a 401 is
          // already handled by the client's silent refresh.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * The typed API client (ARCHITECTURE.md §7).
 *
 * Two rules shape this file:
 *
 *  1. The access token lives in **memory only** — never localStorage, where any
 *     script on the page could read it. It is short-lived (15m) and rebuilt from
 *     the httpOnly refresh cookie on load.
 *  2. A 401 triggers **one** silent refresh and **one** retry. Concurrent 401s
 *     share a single in-flight refresh, so ten parallel queries cause one refresh,
 *     not ten — and ten rotations would look exactly like token theft to the
 *     server's reuse detection.
 */

import type { ApiFailure, User } from "@tracker/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True for the codes that mean "this session is over". */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }
}

// ---------------------------------------------------------------------------
// access token (memory only)
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

type SessionLostListener = () => void;
const sessionLostListeners = new Set<SessionLostListener>();

/** The session provider subscribes so a dead refresh cookie flips the UI to signed-out. */
export function onSessionLost(listener: SessionLostListener): () => void {
  sessionLostListeners.add(listener);
  return () => sessionLostListeners.delete(listener);
}

function announceSessionLost(): void {
  accessToken = null;
  for (const listener of sessionLostListeners) listener();
}

// ---------------------------------------------------------------------------
// requests
// ---------------------------------------------------------------------------

/** What actually reaches fetch, once `body` is allowed to be any JSON value. */
type FetchOptions = Omit<RequestInit, "body"> & { body?: unknown };

interface RequestOptions extends FetchOptions {
  /** Set internally to stop a refresh loop. Stripped before fetch sees it. */
  skipAuthRetry?: boolean;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: ApiFailure | undefined;
  try {
    payload = (await response.json()) as ApiFailure;
  } catch {
    // Non-JSON error body (a proxy, a gateway timeout).
  }
  return new ApiError(
    response.status,
    payload?.error.code ?? "HTTP_ERROR",
    payload?.error.message ?? `Request failed with ${response.status}`,
    payload?.error.details,
  );
}

async function rawFetch(path: string, options: FetchOptions): Promise<Response> {
  const { body, headers, ...rest } = options;

  return fetch(`${API_BASE}/api${path}`, {
    ...rest,
    // The refresh cookie is httpOnly and must ride along on /auth/* calls.
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let pendingRefresh: Promise<string | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Deduped: every caller
 * during one refresh awaits the same promise.
 */
export function refreshSession(): Promise<string | null> {
  pendingRefresh ??= (async () => {
    try {
      const response = await rawFetch("/auth/refresh", { method: "POST" });
      if (!response.ok) {
        announceSessionLost();
        return null;
      }
      const payload = (await response.json()) as { data: { accessToken: string } };
      accessToken = payload.data.accessToken;
      return accessToken;
    } catch {
      // Network failure is not proof the session is dead — do not sign the user
      // out over a dropped connection.
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

/** Performs a request and unwraps the { data } envelope. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRetry = false, ...fetchOptions } = options;

  let response = await rawFetch(path, fetchOptions);

  if (response.status === 401 && !skipAuthRetry) {
    const renewed = await refreshSession();
    if (renewed === null) throw await toApiError(response);
    // One retry, with the new token.
    response = await rawFetch(path, fetchOptions);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

// ---------------------------------------------------------------------------
// auth endpoints
// ---------------------------------------------------------------------------

export const authApi = {
  async register(input: {
    email: string;
    password: string;
    name?: string;
    timezone?: string;
  }): Promise<User> {
    const data = await apiFetch<{ user: User }>("/auth/register", {
      method: "POST",
      body: input,
      skipAuthRetry: true,
    });
    return data.user;
  },

  async login(email: string, password: string): Promise<User> {
    const data = await apiFetch<{ accessToken: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST", skipAuthRetry: true });
    } finally {
      setAccessToken(null);
    }
  },

  async me(): Promise<User> {
    const data = await apiFetch<{ user: User }>("/auth/me");
    return data.user;
  },

  async updateMe(patch: Record<string, unknown>): Promise<User> {
    const data = await apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: patch });
    return data.user;
  },
};

/** The user's IANA timezone as the browser reports it — used at registration. */
export const browserTimezone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

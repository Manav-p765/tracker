"use client";

/**
 * The session (ARCHITECTURE.md §7).
 *
 * On load there is no access token in memory — only the httpOnly refresh cookie.
 * So the provider's first act is a silent refresh: if the cookie is alive the
 * session is restored without the user seeing a login screen; if it is dead they
 * land on /login.
 */

import type { User } from "@tracker/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { authApi, browserTimezone, onSessionLost, refreshSession, setAccessToken } from "./api";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; name?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Replaces the cached user after PATCH /auth/me. */
  setUser: (user: User) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  // Restore the session from the refresh cookie exactly once per page load.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await refreshSession();
      if (cancelled) return;

      if (token === null) {
        setStatus("anonymous");
        return;
      }
      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client tells us when a refresh definitively failed.
  useEffect(
    () =>
      onSessionLost(() => {
        setUser(null);
        setStatus("anonymous");
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await authApi.login(email, password);
    setUser(signedIn);
    setStatus("authenticated");
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      await authApi.register({ ...input, ...(browserTimezone() === undefined ? {} : { timezone: browserTimezone() }) });
      // Registering does not mint tokens server-side, so sign in straight after.
      await signIn(input.email, input.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, setUser }),
    [status, user, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}

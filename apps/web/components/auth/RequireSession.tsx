"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/lib/session";

/**
 * Gates the (app) route group.
 *
 * This is a client-side guard on purpose: the refresh cookie is scoped to the
 * API's host and to /api/auth, so Next middleware cannot see it and could not
 * make this decision. The API is the real boundary — every route there demands a
 * bearer token — and this guard is only about not showing an empty shell.
 *
 * CONSEQUENCE TO RESPECT: `children` is a server-rendered prop, so its RSC payload
 * is sent to the browser even while this component renders nothing but an
 * ellipsis. That is safe only because pages under here hold no user data of their
 * own — every piece of it arrives through an authenticated TanStack Query call
 * (ARCHITECTURE.md §7). Never fetch a user's data in a server component below
 * this guard; fetch it client-side, where the bearer token applies.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    // A quiet mono ellipsis — the design forbids skeleton shimmer (DESIGN.md §8).
    return (
      <p className="px-unit py-unit-3 font-mono text-tag uppercase text-ink-muted" role="status">
        …
      </p>
    );
  }

  if (status === "anonymous") return null;

  return <>{children}</>;
}

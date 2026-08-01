import { NextResponse } from "next/server";

/**
 * The Vercel Cron entry point (ARCHITECTURE.md §5).
 *
 * Vercel Cron can only call a path on its own deployment, but the reminder
 * dispatch lives on the API — which is a different origin and holds the Redis and
 * VAPID credentials. So this is a thin forwarder: Vercel calls here on schedule,
 * this verifies the call is really from Vercel, then hands off to the API with the
 * same shared secret.
 *
 * The schedule itself is declared in `vercel.json`, not here.
 *
 * Nothing about idempotency depends on this hop. If it retries, or fires twice, or
 * races another invocation, the deterministic job ids downstream absorb it.
 */

export const dynamic = "force-dynamic";
/** Cron gets the long ceiling; the dispatch caps its own batch well inside it. */
export const maxDuration = 60;

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
};

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const target = process.env.REMINDER_DISPATCH_URL;

  if (secret === undefined || secret === "" || target === undefined || target === "") {
    // A misconfigured cron must be loud. Silently returning 200 would leave
    // reminders dead with a green tick next to them in the dashboard.
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "CRON_SECRET or REMINDER_DISPATCH_URL is unset" } },
      { status: 503 },
    );
  }

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anyone else is refused.
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(presented, secret)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid cron secret" } },
      { status: 401 },
    );
  }

  const response = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    // Never cache a dispatch.
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => ({}));
  return NextResponse.json(body, { status: response.status });
}

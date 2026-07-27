"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * Primary navigation, in the thumb arc at the bottom (DESIGN.md §8).
 *
 * Mono labels, no icons — pixel art is not permitted in navigation (§7). The
 * active item is marked in ink, not with a pastel: the pastels code data
 * (horizons, moods, projects), never chrome.
 */
const ITEMS = [
  { href: "/", label: "TODAY" },
  { href: "/checkin", label: "LOG" },
  { href: "/goals/daily", label: "GOALS" },
  { href: "/habits", label: "HABITS" },
  { href: "/history", label: "HISTORY" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname.startsWith(href.split("/").slice(0, 2).join("/"));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t-hair border-rule bg-paper"
    >
      <ul className="mx-auto flex max-w-content items-stretch justify-between px-dot">
        {ITEMS.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-tap flex-col items-center justify-center gap-1 font-mono text-micro uppercase",
                  active ? "text-ink" : "text-ink-muted",
                )}
              >
                {label}
                {/* The active marker: a short ink rule, drawn like an underline in pen. */}
                <span
                  aria-hidden="true"
                  className={cn("block h-px w-4", active ? "bg-ink" : "bg-transparent")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

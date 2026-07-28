"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";
import { HORIZONS, HORIZON_TAG, pastelOf, pastelVar, type Horizon } from "./horizon-meta";

/**
 * The five horizons (SCOPE.md §2).
 *
 * Each tab carries its own fixed pastel as a small square, so the colour coding is
 * learned here and recognised everywhere else. The ACTIVE tab is marked in ink —
 * a pastel would be spending colour on chrome, and in this system the pastels code
 * data (DESIGN.md §2).
 *
 * Scrolls horizontally on a narrow phone rather than wrapping to two rows.
 */
export function HorizonTabs({ active }: { active: Horizon }) {
  return (
    <nav aria-label="Horizon" className="-mx-dot overflow-x-auto px-dot">
      <ul className="flex min-w-max gap-dot">
        {HORIZONS.map((horizon) => {
          const selected = horizon === active;
          return (
            <li key={horizon}>
              <Link
                href={`/goals/${horizon}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-tap items-center gap-1.5 font-mono text-tag uppercase",
                  selected ? "text-ink" : "text-ink-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className="block h-2 w-2 rounded-[1px]"
                  style={{ backgroundColor: pastelVar(pastelOf(horizon)) }}
                />
                <span className="flex flex-col items-center gap-1">
                  {HORIZON_TAG[horizon]}
                  <span
                    aria-hidden="true"
                    className={cn("block h-px w-full", selected ? "bg-ink" : "bg-transparent")}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

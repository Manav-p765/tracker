import type { GoalRollup, Horizon, Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";
import { HORIZON_NOUN } from "./horizon-meta";

/**
 * Derived progress, drawn as a filled hairline (DESIGN.md §5, §6).
 *
 * Reads "3/12 monthly done · 25%" in mono above a 1px rule filled in the horizon's
 * pastel. Explicitly NOT a rounded progress bar and NOT a percentage ring —
 * DESIGN.md §9 rules both out.
 *
 * `childHorizon` is only known where the children have been loaded (the detail
 * screen), so the list omits the noun and reads "3/12 done · 25%".
 */
export function ProgressRule({
  rollup,
  pastel,
  childHorizon,
  className,
}: {
  rollup: GoalRollup;
  pastel: Pastel;
  childHorizon?: Horizon;
  className?: string;
}) {
  if (rollup.progressPercent === null) return null;

  const noun = childHorizon === undefined ? "" : `${HORIZON_NOUN[childHorizon]} `;
  const ratio =
    rollup.totalChildren > 0
      ? `${rollup.completedChildren}/${rollup.totalChildren} ${noun}done`
      : "target";

  const fill = {
    sage: "bg-sage",
    clay: "bg-clay",
    powder: "bg-powder",
    ochre: "bg-ochre",
    lilac: "bg-lilac",
  }[pastel];

  return (
    <div className={cn("space-y-1", className)}>
      <p className="font-mono text-micro uppercase text-ink-muted">
        <span data-numeric>{ratio}</span>
        <span aria-hidden="true"> · </span>
        <span data-numeric>{rollup.progressPercent}%</span>
      </p>
      {/* The rule itself: hairline track, pastel fill, square ends. */}
      <div className="h-px w-full bg-rule">
        <div
          className={cn("h-px", fill)}
          style={{ width: `${rollup.progressPercent}%` }}
          role="progressbar"
          aria-valuenow={rollup.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

"use client";

import type { GoalWithRollup, Horizon } from "@tracker/shared";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { GoalCheck } from "./GoalCheck";
import { ProgressRule } from "./ProgressRule";
import { HORIZON_TAG, pastelOf, pastelVar } from "./horizon-meta";

/**
 * One goal on paper.
 *
 * Title in Inter; every number and date in mono. Overdue is marked with a clay
 * rule AND a mono "OVERDUE" label — never colour alone, so the state survives a
 * colourblind reader and a greyscale screenshot (DESIGN.md §8).
 *
 * The whole row links to the detail screen except the checkoff, which is its own
 * button so a thumb can tick without navigating.
 */
export function GoalRow({
  goal,
  onToggle,
  pending = false,
  showHorizon = false,
  childHorizon,
}: {
  goal: GoalWithRollup;
  onToggle: (goal: GoalWithRollup) => void;
  pending?: boolean;
  /** The detail screen's child list spans horizons, so it labels each one. */
  showHorizon?: boolean;
  childHorizon?: Horizon;
}) {
  const pastel = pastelOf(goal.horizon);
  const done = goal.status === "done";

  const meta: string[] = [];
  if (goal.targetValue !== undefined) {
    meta.push(`${goal.currentValue}/${goal.targetValue}`);
  }
  if (goal.dueDate !== undefined) meta.push(goal.dueDate);
  else if (goal.horizon === "daily" && goal.effectiveDueDate !== null) {
    meta.push(goal.effectiveDueDate);
  }
  if (goal.difficulty !== undefined) meta.push(goal.difficulty.toUpperCase());

  return (
    <div className="flex items-start gap-dot py-2">
      <div className="pt-0.5">
        <GoalCheck
          done={done}
          pastel={pastel}
          title={goal.title}
          disabled={pending}
          onToggle={() => onToggle(goal)}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <Link
          href={`/goals/${goal.horizon}/${goal._id}`}
          className="block min-h-[1.5rem] text-ink"
        >
          <span className={cn("text-[0.9375rem]", done && "text-ink-muted line-through")}>
            {goal.title}
          </span>
        </Link>

        {(meta.length > 0 || goal.isOverdue || showHorizon) && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-micro uppercase text-ink-muted">
            {showHorizon ? (
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="block h-2 w-2 rounded-[1px]"
                  style={{ backgroundColor: pastelVar(pastel) }}
                />
                {HORIZON_TAG[goal.horizon]}
              </span>
            ) : null}

            {goal.isOverdue ? (
              // Clay marker plus the word. Both, always.
              <span className="flex items-center gap-1 text-ink">
                <span
                  aria-hidden="true"
                  className="block h-2.5 w-px"
                  style={{ backgroundColor: "var(--clay)" }}
                />
                OVERDUE
              </span>
            ) : null}

            {meta.map((item) => (
              <span key={item} data-numeric>
                {item}
              </span>
            ))}
          </p>
        )}

        <ProgressRule rollup={goal.rollup} pastel={pastel} childHorizon={childHorizon} />
      </div>
    </div>
  );
}

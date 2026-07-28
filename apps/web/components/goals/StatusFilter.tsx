"use client";

import { GOAL_STATUS_VIEWS, type GoalStatusView } from "@tracker/shared";

import { cn } from "@/lib/cn";

const LABELS: Record<GoalStatusView, string> = {
  active: "ACTIVE",
  done: "DONE",
  overdue: "OVERDUE",
};

/**
 * active / done / overdue (SCOPE.md §2).
 *
 * `overdue` is derived server-side from the user's own timezone, so this is a
 * filter over three views of the same field, not three stored states.
 *
 * Selection is drawn in ink, like every other selected thing in this app.
 */
export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: GoalStatusView;
  onChange: (next: GoalStatusView) => void;
  /** Optional per-view counts, shown in mono after the label. */
  counts?: Partial<Record<GoalStatusView, number>>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Status"
      className="flex overflow-hidden rounded-paper border-hair border-rule"
    >
      {GOAL_STATUS_VIEWS.map((view) => {
        const selected = view === value;
        const count = counts?.[view];
        return (
          <button
            key={view}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(view)}
            className={cn(
              "min-h-tap flex-1 border-r-hair border-rule px-2 font-mono text-tag uppercase last:border-r-0",
              "transition-colors duration-ink",
              selected ? "bg-card text-ink" : "text-ink-muted",
            )}
          >
            {LABELS[view]}
            {count === undefined ? null : (
              <span data-numeric className="ml-1.5">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

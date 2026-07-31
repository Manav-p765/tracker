"use client";

import type { GoalStatusView, GoalWithRollup, Horizon } from "@tracker/shared";
import { useState } from "react";

import { GoalRow } from "@/components/goals/GoalRow";
import { GoalSheet } from "@/components/goals/GoalSheet";
import { HorizonTabs } from "@/components/goals/HorizonTabs";
import { StatusFilter } from "@/components/goals/StatusFilter";
import { HORIZON_LABEL, HORIZON_TAG } from "@/components/goals/horizon-meta";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCompleteGoal, useGoals } from "@/lib/goals";

const EMPTY_COPY: Record<GoalStatusView, string> = {
  active: "Nothing open at this horizon. What would make the next stretch count?",
  done: "Nothing checked off here yet.",
  overdue: "Nothing overdue. The page is clean.",
};

/**
 * One horizon's goals (SCOPE.md §2).
 *
 * Exactly one file tag on this screen, and one vignette — which the empty state
 * owns, so nothing else here may draw pixel art (DESIGN.md §4, §7).
 */
export function GoalsHorizonView({ horizon }: { horizon: Horizon }) {
  const [status, setStatus] = useState<GoalStatusView>("active");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<GoalWithRollup | undefined>(undefined);

  const { data: goals, isPending, isError } = useGoals({ horizon, status });

  // Counts for the filter come from the cache when those tabs have been visited,
  // so switching tabs does not blank the numbers.
  const active = useGoals({ horizon, status: "active" });
  const done = useGoals({ horizon, status: "done" });
  const overdue = useGoals({ horizon, status: "overdue" });

  const complete = useCompleteGoal();

  const openCreate = (): void => {
    setEditing(undefined);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-unit-2 pb-unit-4">
      <header className="space-y-unit">
        <FileTag>{HORIZON_TAG[horizon]}</FileTag>
        <SerifHeading level={1}>{HORIZON_LABEL[horizon]} goals</SerifHeading>
        <HairlineRule />
      </header>

      <HorizonTabs active={horizon} />

      <StatusFilter
        value={status}
        onChange={setStatus}
        counts={{
          active: active.data?.length,
          done: done.data?.length,
          overdue: overdue.data?.length,
        }}
      />

      {isPending ? (
        // A quiet mono ellipsis, never a skeleton shimmer (DESIGN.md §8).
        <p className="font-mono text-tag uppercase text-ink-muted">…</p>
      ) : isError ? (
        <p className="text-ink">Could not load these goals. Check the connection and try again.</p>
      ) : goals.length === 0 ? (
        <EmptyState>{EMPTY_COPY[status]}</EmptyState>
      ) : (
        <ul className="divide-y divide-rule">
          {goals.map((goal) => (
            <li key={goal._id}>
              <GoalRow
                goal={goal}
                pending={complete.isPending && complete.variables?.goal._id === goal._id}
                onToggle={(target) =>
                  complete.mutate({ goal: target, completed: target.status !== "done" })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* Primary action in the thumb arc, clear of the bottom nav. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--rhythm)*3.5)] z-20 mx-auto max-w-content px-unit">
        <Button onClick={openCreate} className="w-full">
          New {HORIZON_LABEL[horizon].toLowerCase()} goal
        </Button>
      </div>

      <GoalSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        horizon={horizon}
        goal={editing}
      />
    </div>
  );
}

"use client";

import type { GoalWithRollup } from "@tracker/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoalCheck } from "@/components/goals/GoalCheck";
import { GoalRow } from "@/components/goals/GoalRow";
import { GoalSheet } from "@/components/goals/GoalSheet";
import { ProgressRule } from "@/components/goals/ProgressRule";
import { HORIZON_TAG, pastelOf } from "@/components/goals/horizon-meta";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCompleteGoal, useDeleteGoal, useGoalDetail } from "@/lib/goals";

export function GoalDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { data: goal, isPending, isError } = useGoalDetail(id);
  const complete = useCompleteGoal();
  const remove = useDeleteGoal();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isPending) {
    return <p className="font-mono text-tag uppercase text-ink-muted">…</p>;
  }
  if (isError) {
    return <p className="text-ink">Could not open that goal.</p>;
  }

  const pastel = pastelOf(goal.horizon);
  const done = goal.status === "done";
  const childHorizon = goal.children[0]?.horizon;

  const meta: string[] = [];
  if (goal.targetValue !== undefined) meta.push(`${goal.currentValue}/${goal.targetValue}`);
  if (goal.dueDate !== undefined) meta.push(`DUE ${goal.dueDate}`);
  else if (goal.effectiveDueDate !== null) meta.push(`DUE ${goal.effectiveDueDate}`);
  if (goal.difficulty !== undefined) meta.push(goal.difficulty.toUpperCase());
  if (goal.completedDate !== undefined) meta.push(`DONE ${goal.completedDate}`);

  return (
    <div className="space-y-dot-2 pb-dot-4">
      <header className="space-y-dot">
        <FileTag>{HORIZON_TAG[goal.horizon]}</FileTag>

        {/* The breadcrumb, furthest ancestor first, so it reads like a path. */}
        {goal.parentChain.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-micro uppercase text-ink-muted">
            {[...goal.parentChain].reverse().map((ancestor) => (
              <span key={ancestor._id} className="flex items-center gap-1.5">
                <Link
                  href={`/goals/${ancestor.horizon}/${ancestor._id}`}
                  className="min-h-[1.25rem] text-ink-muted underline decoration-rule underline-offset-2"
                >
                  {ancestor.title}
                </Link>
                <span aria-hidden="true">/</span>
              </span>
            ))}
          </p>
        ) : null}

        <div className="flex items-start gap-dot">
          <div className="pt-1">
            <GoalCheck
              done={done}
              pastel={pastel}
              title={goal.title}
              disabled={complete.isPending}
              onToggle={() => complete.mutate({ goal, completed: !done })}
            />
          </div>
          <SerifHeading level={1} className="flex-1">
            {goal.title}
          </SerifHeading>
        </div>

        {meta.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-micro uppercase text-ink-muted">
            {goal.isOverdue ? (
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
        ) : null}

        <ProgressRule rollup={goal.rollup} pastel={pastel} childHorizon={childHorizon} />
        <HairlineRule />
      </header>

      {goal.notes === undefined ? null : (
        <section className="space-y-dot">
          <SerifHeading level={3}>Notes</SerifHeading>
          <p className="whitespace-pre-wrap text-ink">{goal.notes}</p>
          <HairlineRule />
        </section>
      )}

      <section className="space-y-dot">
        <SerifHeading level={3}>
          {childHorizon === undefined ? "Parts" : `${HORIZON_TAG[childHorizon]} parts`}
        </SerifHeading>

        {goal.children.length === 0 ? (
          <EmptyState>
            Nothing sits under this yet. Break it into a shorter horizon when you are ready.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {goal.children.map((child: GoalWithRollup) => (
              <li key={child._id}>
                <GoalRow
                  goal={child}
                  showHorizon
                  pending={complete.isPending && complete.variables?.goal._id === child._id}
                  onToggle={(target) =>
                    complete.mutate({ goal: target, completed: target.status !== "done" })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <HairlineRule />

      <section className="space-y-dot">
        <div className="flex gap-dot">
          <Button onClick={() => setEditOpen(true)} className="flex-1">
            Edit
          </Button>
          <Button
            variant="plain"
            onClick={() => setConfirmingDelete(true)}
            className="flex-1"
            disabled={remove.isPending}
          >
            Delete
          </Button>
        </div>

        {confirmingDelete ? (
          <div className="space-y-dot rounded-paper border-hair border-rule bg-card p-dot">
            <p className="text-[0.9375rem] text-ink">
              Delete “{goal.title}”?
              {goal.rollup.totalChildren > 0 ? (
                <>
                  {" "}
                  Its{" "}
                  <span data-numeric>{goal.rollup.totalChildren}</span> part
                  {goal.rollup.totalChildren === 1 ? "" : "s"} will be kept and simply detached.
                </>
              ) : null}
            </p>
            <div className="flex gap-dot">
              <Button
                variant="plain"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1"
              >
                Keep it
              </Button>
              <Button
                onClick={() =>
                  remove.mutate(goal._id, {
                    onSuccess: () => router.replace(`/goals/${goal.horizon}`),
                  })
                }
                className="flex-1"
                disabled={remove.isPending}
              >
                {remove.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <GoalSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        horizon={goal.horizon}
        goal={goal}
      />
    </div>
  );
}

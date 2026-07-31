"use client";

import type { GoalWithRollup } from "@tracker/shared";
import { useEffect, useRef, useState } from "react";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { useTodayCheckin, useUpsertCheckin } from "@/lib/checkins";
import { cn } from "@/lib/cn";
import { useCompleteGoal, useTodayGoals } from "@/lib/goals";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";
import { SegmentedMeter } from "./devices";

/**
 * The hero: today's focus (DESIGN.md §5a).
 *
 * The one card on the dashboard you act on directly — ticking a row completes the
 * goal through the same /complete path the goals screen uses, so the rollups and
 * the socket echo behave identically. Everything else here is a summary.
 *
 * Inverted surface, so the eye lands on it first.
 */
export function HeroCard() {
  const { data: goals, isPending, isError, refetch } = useTodayGoals();
  const complete = useCompleteGoal();

  const done = goals?.filter((goal) => goal.status === "done").length ?? 0;
  const total = goals?.length ?? 0;

  return (
    <BentoCard tag="TODAY // FOCUS" tone="dark" span={6} index="01 — A" headerHref="/goals/daily">
      <IntentionLine />

      {isPending ? (
        <CardSkeleton lines={3} />
      ) : isError ? (
        <CardError onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <CardEmpty href="/goals/daily">No goals for today — add one to aim at.</CardEmpty>
      ) : (
        <>
          <ul className="flex flex-col">
            {goals.map((goal, position) => (
              <HeroRow
                key={goal._id}
                goal={goal}
                position={position + 1}
                pending={complete.isPending && complete.variables?.goal._id === goal._id}
                onToggle={() =>
                  complete.mutate({ goal, completed: goal.status !== "done" })
                }
              />
            ))}
          </ul>

          <div className="mt-auto flex items-center gap-3 pt-2">
            <SegmentedMeter
              filled={done}
              total={total}
              colour="var(--ochre)"
              trackColour="var(--dark-rule)"
              label={`${done} of ${total} done today`}
              className="flex-1"
            />
            <p className="font-mono text-micro uppercase text-dark-ink opacity-80">
              <span data-numeric>
                {done}/{total}
              </span>{" "}
              done
            </p>
          </div>
        </>
      )}
    </BentoCard>
  );
}

/**
 * The morning half: today's intention, one line (SCOPE.md §3).
 *
 * Deliberately light — ~15 seconds, no sheet, no ceremony. It commits on blur or
 * Enter rather than on every keystroke, so a slow line does not become a dozen
 * writes, and it only writes when the text actually changed.
 */
function IntentionLine() {
  const checkin = useTodayCheckin();
  const upsert = useUpsertCheckin();

  const stored = checkin.data?.exists === true ? (checkin.data.intention ?? "") : "";
  const [draft, setDraft] = useState(stored);
  const [editing, setEditing] = useState(false);
  const lastSaved = useRef(stored);

  // Adopt the stored value whenever it changes underneath us — unless the user is
  // mid-sentence, in which case their typing wins.
  useEffect(() => {
    if (editing) return;
    setDraft(stored);
    lastSaved.current = stored;
  }, [stored, editing]);

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    if (next === lastSaved.current.trim()) return;
    lastSaved.current = next;
    upsert.mutate({ intention: next === "" ? null : next });
  };

  return (
    <div className="pb-1">
      <label htmlFor="today-intention" className="sr-only">
        Today&rsquo;s intention
      </label>
      <input
        id="today-intention"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="Today's intention…"
        maxLength={280}
        autoComplete="off"
        className={cn(
          "focus-on-dark w-full border-0 border-b bg-transparent px-0 py-1.5",
          "text-[0.9375rem] text-dark-ink placeholder:text-dark-ink placeholder:opacity-45",
          "focus:outline-none",
        )}
        style={{ borderBottomWidth: "var(--stroke-hair)", borderBottomColor: "var(--dark-rule)" }}
      />
    </div>
  );
}

function HeroRow({
  goal,
  position,
  pending,
  onToggle,
}: {
  goal: GoalWithRollup;
  position: number;
  pending: boolean;
  onToggle: () => void;
}) {
  const isDone = goal.status === "done";

  return (
    <li className="flex items-center gap-2.5 py-1">
      <span
        data-numeric
        aria-hidden="true"
        className="w-5 shrink-0 font-mono text-micro text-dark-ink opacity-50"
      >
        {String(position).padStart(2, "0")}
      </span>

      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? `Un-tick “${goal.title}”` : `Tick “${goal.title}” as done`}
        disabled={pending}
        onClick={onToggle}
        className="focus-on-dark -m-1.5 flex min-h-tap min-w-tap items-center justify-center p-1.5 disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="flex h-unit-2 w-unit-2 items-center justify-center rounded-paper border-hair border-dark-rule"
        >
          {isDone ? <PixelGlyph glyph="x" pastel="ochre" scale={3} /> : null}
        </span>
      </button>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.9375rem] text-dark-ink",
          isDone && "line-through opacity-55",
        )}
      >
        {goal.title}
      </span>

      {goal.isOverdue ? (
        <span className="shrink-0 font-mono text-micro uppercase text-dark-ink opacity-80">
          OVERDUE
        </span>
      ) : null}
    </li>
  );
}

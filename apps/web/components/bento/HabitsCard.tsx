"use client";

import type { DayKey } from "@tracker/shared";

import { HabitGrid } from "@/components/habit/HabitGrid";
import { useHabitGrid } from "@/lib/habits";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";
import { SegmentedMeter } from "./devices";

/**
 * Today's habits, tickable in place (DESIGN.md §5a).
 *
 * The live HabitGrid, narrowed to a single column. Ticking here is the same
 * optimistic mutation as the habits screen, so a tap on the dashboard and a tap on
 * /habits are indistinguishable to the cache.
 *
 * Dashed outline: this card holds a live grid, not a summary.
 */
export function HabitsCard({ today, from }: { today: DayKey; from: DayKey }) {
  const { data: rows, isPending, isError, refetch } = useHabitGrid(from, today);

  const done = rows?.filter((row) => row.days[today] === true).length ?? 0;
  const total = rows?.length ?? 0;

  return (
    <BentoCard tag="HABITS" tone="card" span={6} dashed headerHref="/habits" index="03">
      {isPending ? (
        <CardSkeleton lines={3} />
      ) : isError ? (
        <CardError onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <CardEmpty href="/habits">No habits tracked yet — pick one small thing.</CardEmpty>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <HabitGrid rows={rows} today={today} days={[today]} />
          </div>

          <div className="mt-auto flex items-center gap-3 pt-1">
            <SegmentedMeter
              filled={done}
              total={total}
              colour="var(--sage)"
              label={`${done} of ${total} habits done today`}
              className="flex-1"
            />
            <p className="font-mono text-micro uppercase text-ink-muted">
              <span data-numeric>
                {done}/{total}
              </span>{" "}
              today
            </p>
          </div>
        </>
      )}
    </BentoCard>
  );
}

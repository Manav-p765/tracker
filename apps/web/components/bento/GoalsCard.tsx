"use client";

import { monthRange, todayKey } from "@tracker/shared";

import { useGoals } from "@/lib/goals";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";
import { SegmentedMeter } from "./devices";

/**
 * This month's goals, as one number (DESIGN.md §5a).
 *
 * The rollup is the real one from the goals API — done over total for the monthly
 * horizon — not a re-derivation. Taps through to /goals/monthly.
 */
export function GoalsCard() {
  const { data: goals, isPending, isError, refetch } = useGoals({ horizon: "monthly" });

  const total = goals?.length ?? 0;
  const done = goals?.filter((goal) => goal.status === "done").length ?? 0;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <BentoCard tag="MONTHLY" tone="clay" span={3} href="/goals/monthly" index="02">
      {isPending ? (
        <CardSkeleton />
      ) : isError ? (
        <CardError onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <CardEmpty>No monthly goals yet — add one.</CardEmpty>
      ) : (
        <>
          <p className="mt-1 font-heading text-[2.5rem] leading-none text-ink">
            <span data-numeric>{done}</span>
            <span className="opacity-45">/{total}</span>
          </p>

          <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-muted">
            <span data-numeric>{percent}%</span>
            <span aria-hidden="true"> · </span>
            {pacing(done, total)}
          </p>

          <SegmentedMeter
            filled={done}
            total={total}
            colour="var(--clay)"
            label={`${done} of ${total} monthly goals done`}
            className="mt-auto"
          />
        </>
      )}
    </BentoCard>
  );
}

/**
 * "ON TRACK" / "BEHIND", from completion against how much of the month has gone.
 *
 * Stated rather than implied because it is a judgement, not a measurement: if you
 * have done a smaller share of your monthly goals than the share of the month that
 * has elapsed, this reads BEHIND. No goals completed on day one is not "behind".
 */
function pacing(done: number, total: number): string {
  if (done >= total) return "ALL DONE";

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayKey(timezone);
  const { days } = monthRange(today.slice(0, 7));
  const elapsed = Number(today.slice(8, 10)) / days.length;

  return done / total >= elapsed ? "ON TRACK" : "BEHIND";
}

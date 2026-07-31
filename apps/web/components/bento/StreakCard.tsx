"use client";

import { useQueries } from "@tanstack/react-query";
import { addDays, type DayKey } from "@tracker/shared";

import { habitKeys, habitsApi, useHabitGrid, useHabits } from "@/lib/habits";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";
import { BarcodeStrip } from "./devices";

/**
 * The longest-running habit, as a barcode (DESIGN.md §5a).
 *
 * Real data throughout: the streak comes from the habits API, and every bar is an
 * actual logged day from the same grid the habits card reads (React Query dedupes
 * the shared key, so this costs no extra request).
 *
 * The number is plain. No flame, no badge, no celebration — that was cut on
 * purpose (SCOPE.md §6).
 */
export function StreakCard({ today, from }: { today: DayKey; from: DayKey }) {
  const habits = useHabits();
  const grid = useHabitGrid(from, today);

  const streaks = useQueries({
    queries: (habits.data ?? []).map((habit) => ({
      queryKey: habitKeys.streak(habit._id),
      queryFn: () => habitsApi.streak(habit._id),
    })),
  });

  const pending = habits.isPending || grid.isPending || streaks.some((query) => query.isPending);
  const failed = habits.isError || grid.isError || streaks.some((query) => query.isError);

  // The habit with the longest current run leads the card.
  let leadIndex = -1;
  let best = -1;
  streaks.forEach((query, index) => {
    const current = query.data?.current ?? 0;
    if (current > best) {
      best = current;
      leadIndex = index;
    }
  });

  const lead = habits.data?.[leadIndex];
  const days: boolean[] =
    lead === undefined
      ? []
      : (() => {
          const row = grid.data?.find((entry) => entry.habit._id === lead._id);
          const span: boolean[] = [];
          for (let offset = 13; offset >= 0; offset -= 1) {
            span.push(row?.days[addDays(today, -offset)] === true);
          }
          return span;
        })();

  return (
    <BentoCard tag="STREAK" tone="lilac" span={6} href="/habits" index="04">
      {pending ? (
        <CardSkeleton lines={2} />
      ) : failed ? (
        <CardError
          onRetry={() => {
            void habits.refetch();
            void grid.refetch();
            for (const query of streaks) void query.refetch();
          }}
        />
      ) : lead === undefined ? (
        <CardEmpty href="/habits">No habits yet — a streak needs something to count.</CardEmpty>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-heading text-[2.5rem] leading-none text-ink">
                <span data-numeric>{best}</span>
              </p>
              <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-muted">
                {best === 1 ? "day" : "days"} · {lead.name}
              </p>
            </div>
            <p className="font-mono text-micro uppercase text-ink-muted">
              best <span data-numeric>{streaks[leadIndex]?.data?.longest ?? 0}</span>
            </p>
          </div>

          <BarcodeStrip days={days} pastel={lead.pastel} className="mt-auto" />
          <p className="font-mono text-micro uppercase text-ink-muted">last 14 days</p>
        </>
      )}
    </BentoCard>
  );
}

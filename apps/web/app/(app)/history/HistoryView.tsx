"use client";

import { monthKeyOf, toDayKey, type MonthKey } from "@tracker/shared";
import { useState } from "react";

import { MonthChart } from "@/components/history/MonthChart";
import { MonthHeatmap } from "@/components/history/MonthHeatmap";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  SERIES_META,
  SERIES_ORDER,
  isMonthEmpty,
  useHistory,
  type HistorySeriesKey,
} from "@/lib/history";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const shiftMonth = (month: MonthKey, delta: number): MonthKey => {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
};

const monthLabel = (month: MonthKey): string =>
  `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/**
 * The history screen — the "my month adds up to something" payoff.
 *
 * One chart with a series toggle rather than five overlaid lines: at a month's
 * resolution five jagged lines on one axis is noise, and the series have
 * incompatible scales anyway (24 hours against 5 mood points).
 */
export function HistoryView() {
  const thisMonth = monthKeyOf(toDayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const [series, setSeries] = useState<HistorySeriesKey>("habits");

  const { data, isPending, isError, refetch } = useHistory(month);
  const meta = SERIES_META[series];
  // Never past the current month — there is nothing to show and no way to log it.
  const canGoForward = month < thisMonth;

  return (
    <div className="space-y-unit-2 pb-unit-4">
      <header className="space-y-unit">
        <FileTag>HISTORY</FileTag>
        <div className="flex items-center justify-between gap-unit">
          <SerifHeading level={1}>{monthLabel(month)}</SerifHeading>
          <div className="flex items-center gap-1">
            <MonthButton
              label="Previous month"
              symbol="←"
              onClick={() => setMonth(shiftMonth(month, -1))}
            />
            <MonthButton
              label="Next month"
              symbol="→"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={!canGoForward}
            />
          </div>
        </div>
        <HairlineRule />
      </header>

      {isPending ? (
        <ChartSkeleton />
      ) : isError ? (
        <div className="space-y-1.5">
          <p className="font-mono text-micro uppercase text-ink-muted">{"// couldn't load"}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-tap font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : isMonthEmpty(data) ? (
        <EmptyState>Nothing logged this month yet — tonight&rsquo;s check-in starts it.</EmptyState>
      ) : (
        <>
          <section className="space-y-unit">
            <div
              role="radiogroup"
              aria-label="Series"
              className="flex overflow-hidden rounded-paper border-hair border-rule"
            >
              {SERIES_ORDER.map((key) => {
                const active = key === series;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSeries(key)}
                    className={cn(
                      "min-h-tap flex-1 border-r-hair border-rule px-1 font-mono text-micro uppercase last:border-r-0",
                      "transition-colors duration-ink",
                      active ? "bg-card text-ink" : "text-ink-muted",
                    )}
                  >
                    {SERIES_META[key].label}
                  </button>
                );
              })}
            </div>

            <MonthChart
              values={data.series[series]}
              days={data.days}
              min={meta.min}
              max={meta.max ?? niceMax(data.series[series])}
              pastel={meta.pastel}
              label={meta.label}
              unit={meta.unit}
            />
          </section>

          <HairlineRule />

          <section className="space-y-unit">
            <SerifHeading level={3}>Habits</SerifHeading>
            <div className="-mx-1 overflow-x-auto px-1">
              <MonthHeatmap days={data.heatmap} futureFrom={data.futureFrom} />
            </div>
          </section>

          <HairlineRule />

          <section className="space-y-unit">
            <SerifHeading level={3}>Memorable moments</SerifHeading>
            {data.moments.length === 0 ? (
              <p className="text-ink-muted">Nothing written down this month yet.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {data.moments.map((entry) => (
                  <li key={entry.date} className="flex gap-unit py-2">
                    <time
                      dateTime={entry.date}
                      className="w-10 shrink-0 text-[0.8125rem] text-ink-muted"
                    >
                      {entry.date.slice(8, 10)}
                    </time>
                    <span className="text-[0.9375rem] text-ink">{entry.moment}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Rounds an unbounded series up to a readable ceiling, minimum 1. */
function niceMax(values: readonly (number | null)[]): number {
  const highest = values.reduce<number>(
    (best, value) => (value !== null && value > best ? value : best),
    0,
  );
  return Math.max(1, Math.ceil(highest));
}

function MonthButton({
  label,
  symbol,
  onClick,
  disabled = false,
}: {
  label: string;
  symbol: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-tap min-w-tap items-center justify-center rounded-paper border-hair border-rule bg-card font-mono text-ink disabled:opacity-40"
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}

/** Card-shaped, still — no shimmer (DESIGN.md §8), and no layout shift. */
function ChartSkeleton() {
  return (
    <div className="space-y-unit" aria-hidden="true">
      <span className="block h-tap w-full rounded-paper border-hair border-rule bg-card opacity-60" />
      <span className="block h-[120px] w-full rounded-paper bg-card opacity-50" />
      <span className="block h-[150px] w-full rounded-paper bg-card opacity-40" />
      <span className="sr-only">Loading this month</span>
    </div>
  );
}

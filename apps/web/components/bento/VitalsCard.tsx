"use client";

import { monthKeyOf, toDayKey } from "@tracker/shared";

import { SERIES_META, useHistory } from "@/lib/history";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";

/**
 * A live sparkline of the default series — habits completed per day this month
 * (DESIGN.md §5a). Taps through to History.
 *
 * Same honesty rule as the full chart: unlogged days break the line rather than
 * being drawn along the axis. This card used to be a `// SOON` stub precisely
 * because a flat line at zero would have read as "you felt nothing all month";
 * now that the data exists, the gaps are still gaps.
 */
export function VitalsCard() {
  const month = monthKeyOf(toDayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  const { data, isPending, isError, refetch } = useHistory(month);

  const values = data?.series.habits ?? [];
  const logged = values.filter((value) => value !== null).length;

  return (
    <BentoCard tag="VITALS" tone="sage" span={6} href="/history" index="08">
      {isPending ? (
        <CardSkeleton lines={2} />
      ) : isError ? (
        <CardError onRetry={() => void refetch()} />
      ) : logged === 0 ? (
        <CardEmpty href="/checkin">Nothing logged this month yet — start tonight.</CardEmpty>
      ) : (
        <>
          <Sparkline values={values} />
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="block h-2.5 w-2.5 rounded-[1px]"
                style={{ backgroundColor: `var(--${SERIES_META.habits.pastel})` }}
              />
              <span className="font-mono text-micro uppercase text-ink-muted">habits / day</span>
            </span>
            <span className="font-mono text-micro uppercase text-ink-muted">
              <span data-numeric>{logged}</span> day{logged === 1 ? "" : "s"}
            </span>
          </div>
        </>
      )}
    </BentoCard>
  );
}

function Sparkline({ values }: { values: readonly (number | null)[] }) {
  const width = 300;
  const height = 40;
  const highest = values.reduce<number>(
    (best, value) => (value !== null && value > best ? value : best),
    0,
  );
  const max = Math.max(1, highest);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const x = (index: number): number => index * step;
  const y = (value: number): number => height - (value / max) * height;

  // One polyline per run of consecutive logged days. Gaps stay gaps.
  const segments: { index: number; value: number }[][] = [];
  let run: { index: number; value: number }[] = [];
  for (const [index, value] of values.entries()) {
    if (value === null) {
      if (run.length > 0) segments.push(run);
      run = [];
      continue;
    }
    run.push({ index, value });
  }
  if (run.length > 0) segments.push(run);

  const stroke = `var(--${SERIES_META.habits.pastel})`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Habits completed each day this month"
    >
      {segments.map((segment) =>
        segment.length === 1 ? null : (
          <polyline
            key={`line-${segment[0]?.index}`}
            points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth="var(--stroke-ink)"
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
      {values.map((value, index) =>
        value === null ? null : (
          <rect
            key={`vertex-${index}`}
            x={x(index) - 1.5}
            y={y(value) - 1.5}
            width={3}
            height={3}
            fill={stroke}
          />
        ),
      )}
    </svg>
  );
}

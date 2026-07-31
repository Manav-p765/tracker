"use client";

import type { Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * The month's chart — hand-plotted, one series at a time (DESIGN.md §6).
 *
 * Three rules, all load-bearing:
 *
 *  1. **Honest gaps.** A `null` day breaks the line. One polyline per run of
 *     consecutive values, never an interpolation across a gap and never a zero
 *     stood in for missing data. A day you didn't log sleep is a gap, not 0 hours.
 *  2. **Visible vertices.** Each logged day gets a small square mark, so the plot
 *     reads as points someone put on paper rather than a smooth computed curve.
 *  3. **No charting library, no smoothing, no fills, no gradients.** Miter joins.
 */
export function MonthChart({
  values,
  days,
  min,
  max,
  pastel,
  label,
  unit,
}: {
  values: readonly (number | null)[];
  days: readonly string[];
  min: number;
  max: number;
  pastel: Pastel;
  label: string;
  unit: string;
}) {
  const width = 320;
  const height = 120;
  const padLeft = 22;
  const padBottom = 14;
  const plotWidth = width - padLeft;
  const plotHeight = height - padBottom;

  const span = Math.max(1, max - min);
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;

  const x = (index: number): number => padLeft + index * step;
  const y = (value: number): number => plotHeight - ((value - min) / span) * plotHeight;

  // Split into runs of consecutive non-null values. This is the honest-gap rule.
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

  const stroke = `var(--${pastel})`;
  const logged = values.filter((value) => value !== null).length;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label} for the month: ${logged} day${logged === 1 ? "" : "s"} logged, the rest unlogged.`}
      >
        {/* Axis: two hairlines, no gridlines — the line sits on plain paper. */}
        <line
          x1={padLeft}
          y1={0}
          x2={padLeft}
          y2={plotHeight}
          stroke="var(--rule)"
          strokeWidth="1"
        />
        <line
          x1={padLeft}
          y1={plotHeight}
          x2={width}
          y2={plotHeight}
          stroke="var(--rule)"
          strokeWidth="1"
        />

        {/* Y bounds only — the scale, not a grid. */}
        <text x={0} y={8} className="fill-[var(--ink-muted)] font-mono text-[8px]">
          {max}
        </text>
        <text x={0} y={plotHeight} className="fill-[var(--ink-muted)] font-mono text-[8px]">
          {min}
        </text>

        {segments.map((segment) => {
          const points = segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ");
          return segment.length === 1 ? null : (
            <polyline
              key={`line-${segment[0]?.index}`}
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth="var(--stroke-ink)"
              strokeLinejoin="miter"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Vertices: every logged day, including days marooned between gaps. */}
        {values.map((value, index) =>
          value === null ? null : (
            <rect
              key={`vertex-${index}`}
              x={x(index) - 1.75}
              y={y(value) - 1.75}
              width={3.5}
              height={3.5}
              fill={stroke}
            />
          ),
        )}

        {/* X ticks: the 1st, the middle, and the last day of the month. */}
        {[0, Math.floor(values.length / 2), values.length - 1].map((index) => (
          <text
            key={`tick-${index}`}
            x={x(index)}
            y={height - 2}
            textAnchor="middle"
            className="fill-[var(--ink-muted)] font-mono text-[8px]"
          >
            {days[index]?.slice(8, 10)}
          </text>
        ))}
      </svg>

      <figcaption className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="block h-2.5 w-2.5 rounded-[1px]"
            style={{ backgroundColor: stroke }}
          />
          <span className="font-mono text-micro uppercase text-ink-muted">
            {label}
            {unit === "" ? "" : ` · ${unit}`}
          </span>
        </span>
        <span className={cn("font-mono text-micro uppercase text-ink-muted")}>
          <span data-numeric>{logged}</span> day{logged === 1 ? "" : "s"} logged
        </span>
      </figcaption>
    </figure>
  );
}

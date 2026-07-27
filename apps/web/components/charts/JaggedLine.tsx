import type { Pastel } from "@tracker/shared";

/**
 * One hand-plotted series for the vitals chart (DESIGN.md §6).
 *
 * Hand-rolled SVG polylines — there is no charting library in this project, and
 * there will not be one. Miter joins, no curve smoothing, no area fill, no
 * gradient, no shadow, no vertex dots.
 *
 * A missing day **breaks the line**: one polyline per run of consecutive values,
 * never an interpolation across a gap. Gaps are honest.
 *
 * Renders a <g>, so it must be placed inside a parent <svg> that owns the
 * coordinate space. Prompt 1.5 composes three of these into VitalsChart.
 */
export function JaggedLine({
  values,
  min,
  max,
  width,
  height,
  pastel,
}: {
  /** One entry per day. null = unlogged, which breaks the line. */
  values: readonly (number | null)[];
  min: number;
  max: number;
  width: number;
  height: number;
  pastel: Pastel;
}) {
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const toPoint = (value: number, index: number): string => {
    const x = index * step;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  // Split into runs of consecutive non-null values.
  const segments: string[][] = [];
  let current: string[] = [];
  for (const [index, value] of values.entries()) {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(toPoint(value, index));
  }
  if (current.length > 0) segments.push(current);

  return (
    <g>
      {segments.map((points) =>
        points.length === 1 ? (
          // A lone logged day between two gaps: a bare 1px tick, still no dot.
          <line
            key={points[0]}
            x1={points[0]?.split(",")[0]}
            y1={points[0]?.split(",")[1]}
            x2={points[0]?.split(",")[0]}
            y2={points[0]?.split(",")[1]}
            stroke={`var(--${pastel})`}
            strokeWidth="var(--stroke-ink)"
            strokeLinecap="square"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <polyline
            key={points[0]}
            points={points.join(" ")}
            fill="none"
            stroke={`var(--${pastel})`}
            strokeWidth="var(--stroke-ink)"
            strokeLinejoin="miter"
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </g>
  );
}

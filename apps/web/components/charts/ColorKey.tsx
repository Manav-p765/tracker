import type { Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * The small colour key beneath a chart (DESIGN.md §6): one pastel square plus a
 * mono label per series.
 *
 * A pastel never carries meaning on its own — the label is what makes the chart
 * readable, including for colourblind users.
 */
export function ColorKey({
  series,
  className,
}: {
  series: readonly { label: string; pastel: Pastel }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-unit", className)}>
      {series.map(({ label, pastel }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className="block h-2.5 w-2.5 rounded-[1px]"
            style={{ backgroundColor: `var(--${pastel})` }}
          />
          <span className="font-mono text-micro uppercase text-ink-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}

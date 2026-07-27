import type { ScaleBand } from "@tracker/shared";
import { bandFor } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * The mood / energy colour key (DESIGN.md §6) — the pastel-square legend that
 * does what a set of multicolour journal pens did.
 *
 * Five labelled squares. Selection is drawn in **ink**, never by changing the
 * pastel, so the colour of a band means one thing everywhere. The same component
 * renders read-only in month views.
 *
 * Presentational in Phase 0; Prompt 1.4 makes the squares tappable.
 */
export function ColorKeySquares({
  bands,
  value,
  className,
}: {
  bands: readonly ScaleBand[];
  /** Stored 1–10 value, or null when the day is unlogged. */
  value?: number | null;
  className?: string;
}) {
  const selected = bandFor(bands, value);

  return (
    <ul className={cn("flex gap-dot", className)}>
      {bands.map((band) => {
        const isSelected = selected?.label === band.label;
        return (
          <li key={band.label} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "block h-dot-2 w-dot-2 rounded-paper",
                isSelected ? "border-ink" : "border-rule",
              )}
              style={{
                backgroundColor: `var(--${band.pastel})`,
                borderWidth: isSelected ? "var(--stroke-ink)" : "var(--stroke-hair)",
                borderStyle: "solid",
              }}
            />
            <span
              className={cn(
                "font-mono text-micro uppercase",
                isSelected ? "text-ink" : "text-ink-muted",
              )}
            >
              {band.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

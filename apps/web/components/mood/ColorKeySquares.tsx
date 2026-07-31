"use client";

import type { ScaleBand } from "@tracker/shared";
import { bandFor } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * The mood / energy colour key (DESIGN.md §6) — the pastel-square legend that does
 * what a set of multicolour journal pens did.
 *
 * Five squares, one stored value each (1–5). Selection is drawn in **ink**, never
 * by changing the pastel, so a colour means one thing everywhere in the app.
 *
 * Interactive when `onSelect` is given, read-only otherwise — the same component
 * serves the check-in sheet, the home card, and later the month views. Each square
 * is a real radio button: keyboard reachable, announced with its label.
 */
export function ColorKeySquares({
  bands,
  value,
  onSelect,
  disabled = false,
  name,
  size = "regular",
  className,
}: {
  bands: readonly ScaleBand[];
  /** Stored 1–5 value, or null/undefined when the day is unlogged. */
  value?: number | null;
  onSelect?: (value: number) => void;
  disabled?: boolean;
  /** Accessible group name, e.g. "Mood". */
  name?: string;
  /** `compact` fits the dashboard card; `regular` is the check-in sheet. */
  size?: "regular" | "compact";
  className?: string;
}) {
  const selected = bandFor(bands, value);
  const interactive = onSelect !== undefined && !disabled;
  const box = size === "compact" ? "h-7 w-7" : "h-unit-2 w-unit-2";

  return (
    <ul
      className={cn("flex gap-2", className)}
      role={interactive ? "radiogroup" : undefined}
      aria-label={interactive ? name : undefined}
    >
      {bands.map((band) => {
        const isSelected = selected?.value === band.value;

        const square = (
          <span
            className={cn("block rounded-paper", box, isSelected ? "border-ink" : "border-rule")}
            style={{
              backgroundColor: `var(--${band.pastel})`,
              borderWidth: isSelected ? "var(--stroke-ink)" : "var(--stroke-hair)",
              borderStyle: "solid",
            }}
          />
        );

        const label = (
          <span
            className={cn(
              "font-mono text-micro uppercase",
              isSelected ? "text-ink" : "text-ink-muted",
            )}
          >
            {band.label}
          </span>
        );

        return (
          <li key={band.label} className="flex-1">
            {interactive ? (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${name ?? "Value"}: ${band.label}`}
                onClick={() => onSelect(band.value)}
                className="flex min-h-tap w-full flex-col items-center justify-center gap-1"
              >
                {square}
                {label}
              </button>
            ) : (
              <span
                className={cn(
                  "flex flex-col items-center gap-1",
                  disabled && "opacity-60",
                )}
                aria-label={isSelected ? `${name ?? "Value"}: ${band.label}` : undefined}
              >
                {square}
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

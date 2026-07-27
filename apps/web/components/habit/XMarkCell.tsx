import type { Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";

/**
 * One cell of the habit grid (DESIGN.md §6).
 *
 * A --dot-gap × 2 square with a hairline rule border. Done fills it with a pixel
 * X in the habit's own pastel. Empty cells stay genuinely empty — no grey fill,
 * no placeholder tick.
 *
 * Presentational only in Phase 0. Prompt 1.3 makes it tappable (optimistic
 * toggle, ≥44px hit area) and builds HabitGrid around it.
 */
export function XMarkCell({
  done,
  pastel,
  glyph = "x",
  isToday = false,
  label,
  className,
}: {
  done: boolean;
  pastel: Pastel;
  glyph?: string;
  isToday?: boolean;
  /** Screen-reader text, e.g. "Read · Mon 20 Jul · done". */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-dot-2 w-dot-2 items-center justify-center rounded-paper border-hair border-rule",
        className,
      )}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      data-today={isToday || undefined}
    >
      {done ? <PixelGlyph glyph={glyph} pastel={pastel} scale={3} /> : null}
    </div>
  );
}

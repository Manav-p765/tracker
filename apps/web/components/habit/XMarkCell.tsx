import type { Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";

/**
 * One cell of the habit grid (DESIGN.md §6).
 *
 * A --rhythm × 2 square with a hairline rule border. Done fills it with a pixel X
 * in the habit's own pastel — not a font glyph, not a checkbox tick. Empty cells
 * stay genuinely empty: no grey fill, no placeholder.
 *
 * Renders as a button when `onToggle` is given and as a plain cell otherwise, so
 * the same component serves the tappable grid and the read-only month views. The
 * drawn square keeps its 32px rhythm either way; the tap target is padding around
 * it, clearing 44px (DESIGN.md §8).
 */
export function XMarkCell({
  done,
  pastel,
  glyph = "x",
  isToday = false,
  label,
  onToggle,
  disabled = false,
  className,
}: {
  done: boolean;
  pastel: Pastel;
  glyph?: string;
  isToday?: boolean;
  /** Screen-reader text, e.g. "Read · 2026-07-27 · done". */
  label?: string;
  onToggle?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const square = (
    <span
      aria-hidden={onToggle === undefined ? undefined : "true"}
      className={cn(
        "flex h-unit-2 w-unit-2 items-center justify-center rounded-paper border-hair border-rule",
        className,
      )}
      data-today={isToday || undefined}
    >
      {done ? <PixelGlyph glyph={glyph} pastel={pastel} scale={3} /> : null}
    </span>
  );

  if (onToggle === undefined) {
    return (
      <span role={label === undefined ? undefined : "img"} aria-label={label}>
        {square}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="-m-1.5 flex min-h-tap min-w-tap items-center justify-center p-1.5 disabled:opacity-60"
    >
      {square}
    </button>
  );
}

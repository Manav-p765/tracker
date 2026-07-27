import type { Pastel } from "@tracker/shared";

import { PixelCanvas } from "./PixelCanvas";
import { HABIT_GLYPHS, isHabitGlyphKey, type HabitGlyphKey } from "./pixel-art";

/**
 * A tiny 8×8 pixel glyph in one pastel (DESIGN.md §7).
 *
 * Permitted use: habit-grid marks and habit icons. Nowhere else — no glyphs in
 * navigation, buttons, form fields, charts, folder tabs, or notifications.
 */
export function PixelGlyph({
  glyph = "x",
  pastel,
  scale = 2,
  title,
  className,
}: {
  glyph?: HabitGlyphKey | string;
  /** The habit's stable identity colour. */
  pastel: Pastel;
  /** Whole multiples only. 2 → 16px, 3 → 24px. */
  scale?: number;
  title?: string;
  className?: string;
}) {
  const key: HabitGlyphKey = isHabitGlyphKey(glyph) ? glyph : "x";

  return (
    <PixelCanvas
      art={{ rows: HABIT_GLYPHS[key], palette: { "1": `var(--${pastel})` } }}
      scale={scale}
      title={title}
      className={className}
    />
  );
}

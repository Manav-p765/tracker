/**
 * Pixel-art source maps (DESIGN.md §7).
 *
 * Art is authored as character grids and rendered to inline SVG <rect>s with
 * shape-rendering: crispEdges, so nothing is ever upscaled or blurred. Pastels
 * only, at most three per piece, plus --ink for outlines.
 *
 * Pixel art appears in exactly two places in this app: habit-grid marks/glyphs,
 * and one calm vignette on the home header and on empty states. Nowhere else —
 * not in nav, buttons, fields, charts, folder tabs, or notifications.
 */

/** Character → CSS colour slot. "." is always transparent. */
export type PixelPalette = Readonly<Record<string, string>>;

export interface PixelArt {
  readonly rows: readonly string[];
  readonly palette: PixelPalette;
}

export const pixelWidth = (art: PixelArt): number => art.rows[0]?.length ?? 0;
export const pixelHeight = (art: PixelArt): number => art.rows.length;

// ---------------------------------------------------------------------------
// Habit glyphs — 8×8. "1" takes the habit's own pastel, injected at render time.
// ---------------------------------------------------------------------------

export const HABIT_GLYPHS = {
  /** The habit-grid mark. A drawn X, not a font glyph and not a checkbox tick. */
  x: [
    "1......1",
    ".1....1.",
    "..1..1..",
    "...11...",
    "...11...",
    "..1..1..",
    ".1....1.",
    "1......1",
  ],
  book: [
    "1111111.",
    "1..1..1.",
    "1..1..1.",
    "1..1..1.",
    "1..1..1.",
    "1..1..1.",
    "1111111.",
    "........",
  ],
  drop: [
    "...1....",
    "...1....",
    "..111...",
    ".11111..",
    "1111111.",
    "1111111.",
    ".11111..",
    "..111...",
  ],
  shoe: [
    "........",
    "..1.....",
    "..1.....",
    "..11....",
    "..111...",
    ".111111.",
    "11111111",
    "........",
  ],
} as const;

export type HabitGlyphKey = keyof typeof HABIT_GLYPHS;

export const isHabitGlyphKey = (key: string): key is HabitGlyphKey =>
  Object.prototype.hasOwnProperty.call(HABIT_GLYPHS, key);

// ---------------------------------------------------------------------------
// The vignette — one small, quiet scene. 32×15, so it stays under 96px tall at
// any sensible whole-number scale. Three pastels + ink.
// ---------------------------------------------------------------------------

export const VIGNETTE: PixelArt = {
  rows: [
    "................................",
    ".........................ooo....",
    "........................ooooo...",
    ".........................ooo....",
    "................................",
    ".....s..........................",
    "....sss........s................",
    "...sssss......sss...............",
    "..sssssss....sssss..............",
    ".....i........sss...............",
    ".....i.........i................",
    "....sssssssssssssssss...........",
    "..ssssssssssssssssssssssss......",
    "ssssssssssssssssssssssssssssssss",
    "pppppppppppppppppppppppppppppppp",
  ],
  palette: {
    s: "var(--sage)",
    o: "var(--ochre)",
    p: "var(--powder)",
    i: "var(--ink)",
  },
};

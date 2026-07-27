import { cn } from "@/lib/cn";

import { pixelHeight, pixelWidth, type PixelArt } from "./pixel-art";

/**
 * Renders a character-grid PixelArt as inline SVG rects (DESIGN.md §7).
 *
 * One rect per set pixel, one unit per pixel in the viewBox, and a whole-number
 * `scale` — so the art lands on exact device pixels and never blurs. Shared by
 * PixelGlyph and PixelVignette; not used directly elsewhere.
 */
export function PixelCanvas({
  art,
  scale,
  className,
  title,
}: {
  art: PixelArt;
  /** Whole multiples only, so the pixel unit stays crisp. */
  scale: number;
  className?: string;
  /** Omit for decoration; the SVG is then aria-hidden. */
  title?: string;
}) {
  const width = pixelWidth(art);
  const height = pixelHeight(art);
  const rects: Array<{ x: number; y: number; fill: string }> = [];

  for (const [y, row] of art.rows.entries()) {
    for (const [x, char] of [...row].entries()) {
      const fill = art.palette[char];
      if (char === "." || fill === undefined) continue;
      rects.push({ x, y, fill });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      className={cn("pixelated block", className)}
      role={title === undefined ? "presentation" : "img"}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      {rects.map(({ x, y, fill }) => (
        // 1×1 units with no gap — adjacent pixels read as one shape.
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

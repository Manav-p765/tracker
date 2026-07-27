import { PixelCanvas } from "./PixelCanvas";
import { VIGNETTE } from "./pixel-art";

/**
 * The one calm pixel scene (DESIGN.md §7): the home header, and empty states.
 *
 * It is a wink, not a theme. Small, silent, and **exactly one per screen** — if a
 * screen already shows a vignette, its empty states use plain text instead.
 */
export function PixelVignette({
  /** 3 → 96×45px, the header size. 2 → smaller, for empty states. */
  scale = 3,
  className,
}: {
  scale?: number;
  className?: string;
}) {
  return <PixelCanvas art={VIGNETTE} scale={scale} className={className} />;
}

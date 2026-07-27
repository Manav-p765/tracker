import { cn } from "@/lib/cn";

/**
 * The mono "file tag" eyebrow (DESIGN.md §4): `DAILY //`, `WEEK 04 //`,
 * `PROJECT · JP //`.
 *
 * Rules, because this is the single easiest device in the system to overuse:
 *   - section headers ONLY — not on rows, buttons, cards, or empty states
 *   - at most TWO per screen; a third means the screen needs restructuring
 *   - the trailing " //" is part of the device and is added here, so callers
 *     pass just the label
 */
export function FileTag({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-tag uppercase text-ink-muted",
        className,
      )}
    >
      {children}
      <span aria-hidden="true">{" //"}</span>
    </p>
  );
}

import { PixelVignette } from "@/components/pixel/PixelVignette";

/**
 * An empty state written as a journal prompt (DESIGN.md §8) — never marketing
 * copy, never an illustration-plus-CTA sales block.
 *
 * `withVignette` defaults to true, but a screen that already shows one must pass
 * false: one vignette per screen, no exceptions (DESIGN.md §7).
 */
export function EmptyState({
  children,
  withVignette = true,
}: {
  children: string;
  withVignette?: boolean;
}) {
  return (
    <div className="space-y-dot py-dot-2">
      {withVignette ? <PixelVignette scale={2} /> : null}
      <p className="text-ink-muted">{children}</p>
    </div>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * An opaque oat panel sitting on the paper (DESIGN.md §4).
 *
 * Elevation is the --card fill alone — there are no shadows anywhere in the app.
 * The dot grid deliberately does not show through. Prefer a HairlineRule when a
 * boundary is all you need; reach for a sheet only when content must lift off
 * the page.
 */
export function PaperSheet({
  children,
  className,
  bordered = true,
}: {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-paper bg-card p-dot",
        bordered && "border-hair border-rule",
        className,
      )}
    >
      {children}
    </div>
  );
}

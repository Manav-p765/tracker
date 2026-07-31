import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A paper button (DESIGN.md §8). Oat fill, hairline rule, barely rounded, and at
 * least 44px tall so it is thumb-reachable. No shadow, no gradient, no pastel
 * fill — pastels code data, not chrome.
 */
export function Button({
  children,
  variant = "quiet",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** `quiet` is the default; `plain` drops the fill for inline actions. */
  variant?: "quiet" | "plain";
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-tap rounded-paper px-unit text-[0.9375rem] font-medium text-ink",
        "transition-colors duration-ink",
        variant === "quiet" && "border-hair border-rule bg-card",
        variant === "plain" && "border-hair border-transparent",
        "disabled:text-ink-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

import type { InputHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/cn";

/**
 * A field written on paper: a mono label, and an input sitting on a hairline rule
 * rather than inside a box (DESIGN.md §4 — a rule wherever a rule will do).
 */
export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy = error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-mono text-tag uppercase text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-tap w-full rounded-none border-0 border-b bg-transparent px-0 text-ink",
          "placeholder:text-ink-muted focus:outline-none focus-visible:border-ink",
          // The rule under the field turns clay when the value is wrong — always
          // alongside a written message, never colour alone.
          error === undefined ? "border-b-rule" : "border-b-clay",
        )}
        style={{ borderBottomWidth: "var(--stroke-hair)" }}
        {...props}
      />
      {error !== undefined ? (
        <p id={`${id}-error`} className="text-[0.8125rem] text-ink">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

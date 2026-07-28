import type { TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/cn";

/** A multi-line note on ruled paper. Matches TextField (DESIGN.md §4). */
export function TextAreaField({
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  const id = useId();

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-mono text-tag uppercase text-ink-muted">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={cn(
          "w-full resize-y rounded-none border-0 border-b border-b-rule bg-transparent px-0 py-2",
          "text-ink placeholder:text-ink-muted focus:outline-none focus-visible:border-ink",
        )}
        style={{ borderBottomWidth: "var(--stroke-hair)" }}
        {...props}
      />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

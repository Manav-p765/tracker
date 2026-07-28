"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { cn } from "@/lib/cn";

/**
 * A bottom sheet — the app's only modal shape (DESIGN.md §8).
 *
 * Create and edit flows are sheets, not full-page forms and not centred dialogs,
 * so the primary action stays in the thumb arc. Motion is a ≤150ms opacity fade
 * and nothing else: ink appears, it does not spring.
 *
 * Escape closes, the backdrop closes, focus moves in on open and the page behind
 * cannot scroll while it is up.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sits at the bottom, inside the thumb arc. */
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    // Stop the paper behind from scrolling under the sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus in, so a keyboard or screen reader lands inside the sheet.
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button",
    );
    firstField?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30">
      {/* Backdrop: ink at low opacity, no blur — glassmorphism is out (§9). */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/30 transition-opacity duration-ink"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto max-w-content",
          "max-h-[88dvh] overflow-y-auto rounded-t-[6px] border-t-hair border-rule bg-paper",
          "pb-[max(var(--dot-gap),env(safe-area-inset-bottom))]",
        )}
      >
        <div className="space-y-dot p-dot">
          <SerifHeading level={2}>{title}</SerifHeading>
          <HairlineRule />
          {children}
        </div>

        {footer === undefined ? null : (
          <div className="sticky bottom-0 border-t-hair border-rule bg-paper px-dot py-dot">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { RequireSession } from "@/components/auth/RequireSession";
import { BottomNav } from "@/components/ui/BottomNav";

/**
 * The app shell: one column, phone-first, capped at --content-max so it never
 * becomes a multi-column dashboard on a laptop (DESIGN.md §8).
 *
 * The only chrome is the bottom nav in the thumb arc and a quiet settings link —
 * no top bar, no border, nothing competing with the paper.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <div className="mx-auto flex max-w-content justify-end px-dot pt-dot">
        <Link
          href="/settings"
          className="font-mono text-tag uppercase tracking-[0.08em] text-ink-muted"
        >
          Settings
        </Link>
      </div>
      <main className="mx-auto max-w-content px-dot pb-dot-4 pt-dot">{children}</main>
      <BottomNav />
    </RequireSession>
  );
}

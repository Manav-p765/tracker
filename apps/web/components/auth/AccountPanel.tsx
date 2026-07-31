"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";

/** The account block on the settings screen: who is signed in, and a way out. */
export function AccountPanel() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="space-y-unit">
      <dl className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-unit">
          <dt className="font-mono text-tag uppercase text-ink-muted">Email</dt>
          <dd className="font-mono text-[0.875rem] text-ink">{user?.email ?? "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-unit">
          <dt className="font-mono text-tag uppercase text-ink-muted">Timezone</dt>
          <dd className="font-mono text-[0.875rem] text-ink">{user?.timezone ?? "—"}</dd>
        </div>
      </dl>

      <Button
        onClick={() => {
          setSigningOut(true);
          void signOut().then(() => router.replace("/login"));
        }}
        disabled={signingOut}
        className="w-full"
      >
        {signingOut ? "…" : "Sign out"}
      </Button>
    </div>
  );
}

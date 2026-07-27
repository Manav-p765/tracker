import Link from "next/link";

import { AccountPanel } from "@/components/auth/AccountPanel";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * Settings. Phase 0 ships the paper toggle; Prompt 2.1 adds the notification
 * gate and Prompt 2.2 the reminder time.
 *
 * The route index below is scaffolding so the stubbed screens stay reachable
 * while the bottom nav only carries the five daily-loop destinations.
 */
const ELSEWHERE = [
  { href: "/projects", label: "Learning projects", when: "Prompt 3.1" },
  { href: "/vault", label: "Vault", when: "Prompt 3.2" },
  { href: "/events", label: "Important events", when: "Prompt 3.3" },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-dot-2">
      <header className="space-y-dot">
        <FileTag>SETTINGS</FileTag>
        <SerifHeading level={1}>Settings</SerifHeading>
        <HairlineRule />
      </header>

      <section className="space-y-dot">
        <SerifHeading level={3}>Account</SerifHeading>
        <AccountPanel />
      </section>

      <HairlineRule />

      <section className="space-y-dot">
        <SerifHeading level={3}>Paper</SerifHeading>
        <ThemeToggle />
        <p className="text-[0.9375rem] text-ink-muted">
          Day paper, night paper, or whatever the phone is set to.
        </p>
      </section>

      <HairlineRule />

      <section className="space-y-dot">
        <SerifHeading level={3}>Reminders</SerifHeading>
        <p className="text-[0.9375rem] text-ink-muted">
          The evening nudge arrives once the app is installed and you have said yes.
        </p>
        <p className="font-mono text-tag uppercase text-ink-muted">
          Prompt 2.1 asks for permission · Prompt 2.2 sends the push
        </p>
      </section>

      <HairlineRule />

      <section className="space-y-dot">
        <SerifHeading level={3}>Elsewhere</SerifHeading>
        <ul className="divide-y divide-rule">
          {ELSEWHERE.map(({ href, label, when }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-tap items-center justify-between gap-dot text-ink"
              >
                <span className="text-[0.9375rem]">{label}</span>
                <span className="font-mono text-tag uppercase text-ink-muted">{when}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

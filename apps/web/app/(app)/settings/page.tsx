import Link from "next/link";

import { AccountPanel } from "@/components/auth/AccountPanel";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { NotificationSetup } from "@/components/push/NotificationSetup";
import { ReminderSettings } from "@/components/push/ReminderSettings";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * Settings. The reminder gate lives here; Prompt 2.2 adds the reminder TIME and
 * the scheduler that actually sends.
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
    <div className="space-y-unit-2">
      <header className="space-y-unit">
        <FileTag>SETTINGS</FileTag>
        <SerifHeading level={1}>Settings</SerifHeading>
        <HairlineRule />
      </header>

      <section className="space-y-unit">
        <SerifHeading level={3}>Account</SerifHeading>
        <AccountPanel />
      </section>

      <HairlineRule />

      <section className="space-y-unit">
        <SerifHeading level={3}>Paper</SerifHeading>
        <ThemeToggle />
        <p className="text-[0.9375rem] text-ink-muted">
          Day paper, night paper, or whatever the phone is set to.
        </p>
      </section>

      <HairlineRule />

      <section className="space-y-unit">
        <SerifHeading level={3}>Reminders</SerifHeading>
        <NotificationSetup />
        <HairlineRule />
        <ReminderSettings />
      </section>

      <HairlineRule />

      <section className="space-y-unit">
        <SerifHeading level={3}>Elsewhere</SerifHeading>
        <ul className="divide-y divide-rule">
          {ELSEWHERE.map(({ href, label, when }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-tap items-center justify-between gap-unit text-ink"
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

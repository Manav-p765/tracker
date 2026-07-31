"use client";

import { useCallback, useEffect, useState } from "react";

import { HairlineRule } from "@/components/paper/HairlineRule";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  canPromptInstall,
  onInstallAvailabilityChange,
  promptInstall,
} from "@/lib/install-prompt";
import {
  disablePush,
  enablePush,
  isStandalone,
  resolvePushState,
  type PushState,
} from "@/lib/push";

/**
 * The install → permission → subscribe gate (ARCHITECTURE.md §8).
 *
 * One explicit state at a time, each with exactly one honest action. Nothing here
 * renders a button that cannot work, and nothing claims reminders are on unless the
 * server has actually stored a subscription.
 *
 * This prompt only *creates* the subscription. Nothing sends yet — Prompt 2.2 does
 * that — and the copy says so rather than implying reminders will start arriving.
 */
export function NotificationSetup() {
  const [state, setState] = useState<PushState>("CHECKING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await resolvePushState());
    } catch {
      // A failed status read is not a permission problem — do not mislabel it.
      setError("Could not check your reminder status.");
      setState("ERROR");
    }
  }, []);

  useEffect(() => {
    void refresh();
    setInstallable(canPromptInstall());
    return onInstallAvailabilityChange(() => setInstallable(canPromptInstall()));
  }, [refresh]);

  const turnOn = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "ERROR") setError("Could not finish turning reminders on.");
    } catch (caught) {
      // Permission may well have been granted — but without a stored subscription
      // this is NOT the subscribed state, and saying so would be a lie.
      setError(caught instanceof Error ? caught.message : "Could not subscribe this device.");
      setState("ERROR");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      await refresh();
    } catch {
      setError("Could not turn reminders off. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    const accepted = await promptInstall();
    // Installing reloads into standalone; re-check either way.
    if (accepted) await refresh();
  };

  return (
    <div className="space-y-unit">
      <StateLine state={state} />

      {state === "CHECKING" ? (
        <p className="font-mono text-tag uppercase text-ink-muted">…</p>
      ) : null}

      {state === "UNSUPPORTED" ? (
        <Note>
          This browser doesn&rsquo;t support web notifications. On Android, open the app in Chrome
          and reminders become available.
        </Note>
      ) : null}

      {state === "NOT_INSTALLED" ? (
        <div className="space-y-unit">
          <Note>
            Install the app to your home screen first — Android only allows reliable reminders for
            installed apps, and asking before then is the quickest way to get blocked for good.
          </Note>
          {installable ? (
            <Button onClick={() => void install()} className="w-full">
              Install app
            </Button>
          ) : (
            <Note>
              Your browser hasn&rsquo;t offered an install button yet. Open the ⋮ menu and choose
              <strong className="font-medium"> Add to Home screen</strong>, then come back here.
            </Note>
          )}
        </div>
      ) : null}

      {state === "INSTALLED_NO_PERMISSION" ? (
        <div className="space-y-unit">
          <Note>
            Reminders arrive as a notification in the evening. You can turn them off at any time.
          </Note>
          <Button onClick={() => void turnOn()} disabled={busy} className="w-full">
            {busy ? "Turning on…" : "Turn on reminders"}
          </Button>
        </div>
      ) : null}

      {state === "PERMISSION_DENIED" ? (
        <Note>
          Notifications are blocked for this app. Nothing here can undo that — it has to be changed
          in the browser: open the ⋮ menu → <strong className="font-medium">Site settings</strong> →
          Notifications → Allow, then reopen this screen.
        </Note>
      ) : null}

      {state === "SUBSCRIBED" ? (
        <div className="space-y-unit">
          <Note>
            This device is registered. Nothing is being sent yet — the scheduler that actually
            delivers the evening reminder is the next piece of work.
          </Note>
          <Button variant="plain" onClick={() => void turnOff()} disabled={busy} className="w-full">
            {busy ? "Turning off…" : "Turn off reminders"}
          </Button>
        </div>
      ) : null}

      {state === "ERROR" ? (
        <div className="space-y-unit">
          <Note>{error ?? "Something went wrong setting up reminders."}</Note>
          <Button onClick={() => void turnOn()} disabled={busy} className="w-full">
            {busy ? "Trying…" : "Try again"}
          </Button>
        </div>
      ) : null}

      {error !== null && state !== "ERROR" ? (
        <p role="alert" className="text-[0.875rem] text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The status line: what is true right now, in one sentence. */
function StateLine({ state }: { state: PushState }) {
  const label: Record<PushState, string> = {
    CHECKING: "CHECKING",
    UNSUPPORTED: "NOT AVAILABLE",
    NOT_INSTALLED: "NOT INSTALLED",
    INSTALLED_NO_PERMISSION: "READY TO TURN ON",
    PERMISSION_DENIED: "BLOCKED",
    SUBSCRIBED: "ON",
    ERROR: "SOMETHING WENT WRONG",
  };

  return (
    <div className="flex items-center justify-between gap-unit">
      <p className="font-mono text-tag uppercase text-ink-muted">Reminders</p>
      <p
        className={cn(
          "font-mono text-tag uppercase",
          state === "SUBSCRIBED" ? "text-ink" : "text-ink-muted",
        )}
      >
        {/* State is spelled out, never colour alone. */}
        {state === "SUBSCRIBED" ? (
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-2 w-2 rounded-[1px] align-middle"
            style={{ backgroundColor: "var(--sage)" }}
          />
        ) : null}
        {label[state]}
      </p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.875rem] leading-snug text-ink-muted">{children}</p>;
}

/**
 * The home-screen nudge: shown only once the app is installed and reminders are not
 * yet on, so it can never be the thing that triggers a cold-visit permission prompt.
 */
export function ReminderNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;
    void resolvePushState().then((state) => setShow(state === "INSTALLED_NO_PERMISSION"));
  }, []);

  if (!show) return null;

  return (
    <div className="space-y-unit rounded-paper border-hair border-rule bg-card p-unit">
      <p className="font-mono text-tag uppercase text-ink-muted">REMINDERS //</p>
      <p className="text-[0.875rem] text-ink-muted">
        Turn on an evening nudge so the check-in doesn&rsquo;t depend on remembering.
      </p>
      <HairlineRule />
      <NotificationSetup />
    </div>
  );
}

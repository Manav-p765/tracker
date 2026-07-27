import { HORIZONS, type Horizon } from "@tracker/shared";
import { notFound } from "next/navigation";

import { RouteStub } from "@/components/ui/RouteStub";

const TITLES: Record<Horizon, string> = {
  daily: "Daily goals",
  weekly: "Weekly goals",
  monthly: "Monthly goals",
  yearly: "Yearly goals",
  longterm: "Long-term goals",
};

const isHorizon = (value: string): value is Horizon =>
  (HORIZONS as readonly string[]).includes(value);

export default async function GoalsHorizonPage({
  params,
}: {
  params: Promise<{ horizon: string }>;
}) {
  const { horizon } = await params;
  if (!isHorizon(horizon)) notFound();

  return (
    <RouteStub
      tag={horizon === "longterm" ? "LONG TERM" : horizon.toUpperCase()}
      title={TITLES[horizon]}
      builtBy="Prompt 1.2"
      note="Horizon tabs, active / done / overdue, checkoff, and the parent rollup."
    />
  );
}

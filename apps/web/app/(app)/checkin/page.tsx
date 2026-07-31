import { EveningCheckin } from "@/components/checkin/EveningCheckin";

/**
 * The evening ritual, reachable from the bottom nav's LOG tab and the home MOOD
 * card. `?date=` backfills a missed day inside the 14-day window.
 */
export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  return <EveningCheckin {...(date === undefined ? {} : { date })} />;
}

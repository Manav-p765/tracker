import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";

/**
 * Placeholder for a route the shell owns but a later prompt fills in.
 *
 * Written as a journal note rather than a "coming soon" banner — and with no
 * vignette, because pixel art is rationed (DESIGN.md §7).
 */
export function RouteStub({
  tag,
  title,
  builtBy,
  note,
}: {
  tag: string;
  title: string;
  /** e.g. "Prompt 1.2". */
  builtBy: string;
  note?: string;
}) {
  return (
    <section className="space-y-dot">
      <FileTag>{tag}</FileTag>
      <SerifHeading level={1}>{title}</SerifHeading>
      <HairlineRule />
      <p className="text-ink-muted">{note ?? "Nothing here yet."}</p>
      <p className="font-mono text-tag uppercase text-ink-muted">{builtBy} builds this screen</p>
    </section>
  );
}

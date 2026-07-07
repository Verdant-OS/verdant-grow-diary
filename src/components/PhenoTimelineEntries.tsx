/**
 * PhenoTimelineEntries — read-only presenter for pheno-hunt records on a
 * plant/hunt timeline (sex observations, keeper decisions, reversals, crosses).
 *
 * Presenter only: all shaping/ordering lives in phenoTimelineEntriesViewModel.
 * No writes, no Supabase, no alerts/Action-Queue/device — pure display.
 */
import type { PhenoTimelineEntry } from "@/lib/phenoTimelineEntriesViewModel";

interface Props {
  entries: ReadonlyArray<PhenoTimelineEntry>;
  /** Optional heading; omit to render just the list (e.g. inside a section). */
  heading?: string;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "date not recorded";
  // Date-only, locale-stable enough for a timeline label; never throws.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "date not recorded" : d.toISOString().slice(0, 10);
}

export default function PhenoTimelineEntries({ entries, heading }: Props) {
  if (entries.length === 0) {
    return (
      <p data-testid="pheno-timeline-empty" className="text-sm text-muted-foreground">
        No pheno-hunt activity recorded yet.
      </p>
    );
  }

  return (
    <section data-testid="pheno-timeline" className="space-y-2">
      {heading && <h3 className="text-sm font-semibold">{heading}</h3>}
      <ul className="space-y-1">
        {entries.map((e) => (
          <li
            key={e.id}
            data-testid={`pheno-timeline-entry-${e.id}`}
            data-kind={e.kind}
            className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1 text-sm"
          >
            <span className="font-medium">{e.title}</span>
            {e.badge && (
              <span
                data-testid={`pheno-timeline-badge-${e.id}`}
                className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium"
              >
                {e.badge}
              </span>
            )}
            {e.detail && <span className="text-muted-foreground">{e.detail}</span>}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {formatWhen(e.occurredAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Compact per-candidate PHENOHUNT stress testing summary card.
 * Presenter only — takes an aggregated summary and renders it.
 */
import type { PhenoStressSummary } from "@/lib/pheno/phenoStressSummary";

export interface PhenoStressSummaryCardProps {
  readonly summary: PhenoStressSummary;
  readonly candidateLabel?: string | null;
}

export default function PhenoStressSummaryCard({
  summary,
  candidateLabel,
}: PhenoStressSummaryCardProps) {
  return (
    <article
      data-testid={`pheno-stress-summary-${summary.plantId}`}
      data-planned={summary.plannedCount}
      data-observed={summary.observedCount}
      data-recommendation={summary.currentRecommendation ?? ""}
      data-intensity={summary.mostRecentIntensity ?? ""}
      data-has-diary={summary.hasDiaryEvidence ? "true" : "false"}
      className="rounded border border-border bg-card p-3 text-sm"
    >
      <header className="flex items-center justify-between">
        <span className="font-medium">
          {candidateLabel ?? summary.plantId}
        </span>
        {summary.hasDiaryEvidence && (
          <span
            data-testid={`pheno-stress-summary-diary-${summary.plantId}`}
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary"
          >
            Diary evidence
          </span>
        )}
      </header>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Planned</dt>
        <dd data-testid={`pheno-stress-summary-planned-${summary.plantId}`}>
          {summary.plannedCount}
        </dd>
        <dt className="text-muted-foreground">Observed</dt>
        <dd data-testid={`pheno-stress-summary-observed-${summary.plantId}`}>
          {summary.observedCount}
        </dd>
        <dt className="text-muted-foreground">Recent factor</dt>
        <dd>{summary.mostRecentFactor ?? "—"}</dd>
        <dt className="text-muted-foreground">Intensity</dt>
        <dd>{summary.mostRecentIntensity ?? "—"}</dd>
        <dt className="text-muted-foreground">Recommendation</dt>
        <dd>{summary.currentRecommendation ?? "—"}</dd>
      </dl>

      {summary.keyNotesPreview && (
        <p
          data-testid={`pheno-stress-summary-notes-${summary.plantId}`}
          className="mt-2 text-xs text-muted-foreground"
        >
          {summary.keyNotesPreview}
        </p>
      )}
    </article>
  );
}

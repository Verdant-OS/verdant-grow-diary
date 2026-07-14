/**
 * GrowLearningSummary — deterministic counts only. No effectiveness score,
 * no success percentage, no "best intervention" ranking.
 */
import {
  SUMMARY_METRIC_LABELS,
  SUMMARY_METRIC_ORDER,
  type GrowLearningSummary as Summary,
} from "@/lib/growLearningReviewViewModel";

export interface GrowLearningSummaryProps {
  readonly summary: Summary;
}

export function GrowLearningSummary({ summary }: GrowLearningSummaryProps) {
  return (
    <section aria-labelledby="grow-learning-summary-heading" className="glass rounded-2xl p-4">
      <h2 id="grow-learning-summary-heading" className="text-lg font-semibold">
        This run so far
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SUMMARY_METRIC_ORDER.map((key) => (
          <div key={key} className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{SUMMARY_METRIC_LABELS[key]}</dt>
            <dd className="text-xl font-semibold">{summary[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Counts only. Verdant does not score how effective any action was — you record what you
        observed, and you decide what to do next run.
      </p>
    </section>
  );
}

/**
 * EnvironmentSummaryReport — presenter-only premium environment summary
 * report. No queries, no writes, no automation. Consumes a pre-built
 * EnvironmentSummaryReportViewModel.
 */
import { cn } from "@/lib/utils";
import type {
  EnvironmentSummaryReportViewModel,
  RuleSeverity,
} from "@/lib/environmentSummaryReportViewModel";

const SEVERITY_CLASS: Record<RuleSeverity, string> = {
  info: "bg-secondary/60 border-border/40 text-muted-foreground",
  watch: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  critical: "bg-red-500/10 border-red-500/30 text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  valid: "Valid",
  review_required: "Review required",
  dst_ambiguous: "DST-ambiguous",
  invalid: "Invalid",
};

export interface EnvironmentSummaryReportProps {
  report: EnvironmentSummaryReportViewModel;
  className?: string;
}

export default function EnvironmentSummaryReport({
  report,
  className,
}: EnvironmentSummaryReportProps) {
  return (
    <section
      data-testid="environment-summary-report"
      data-premium="true"
      data-total-checks={report.totalChecks}
      className={cn("rounded-xl border border-border/40 bg-card/50 p-4 space-y-4", className)}
      aria-label="Premium environment summary report"
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Environment summary</h2>
          <p data-testid="env-report-date-range" className="text-xs text-muted-foreground">
            {report.dateRangeLabel}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 px-2 py-0.5">
          Premium
        </span>
      </header>

      {report.emptyState ? (
        <p data-testid="env-report-empty" className="text-sm text-muted-foreground">
          {report.emptyState}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["valid", "review_required", "dst_ambiguous", "invalid"] as const).map((s) => (
              <div
                key={s}
                data-testid={`env-report-status-${s}`}
                data-count={report.statusCounts[s]}
                className="rounded-lg border border-border/40 bg-secondary/40 p-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[s]}
                </div>
                <div className="text-lg font-semibold">{report.statusCounts[s]}</div>
              </div>
            ))}
          </div>

          {report.summaryBullets.length > 0 && (
            <ul data-testid="env-report-bullets" className="text-xs space-y-1 list-disc pl-4">
              {report.summaryBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">Source breakdown</h3>
            <div
              data-testid="env-report-sources"
              className="flex flex-wrap gap-1.5"
            >
              {Object.entries(report.sourceCounts).map(([src, count]) => (
                <span
                  key={src}
                  data-testid={`env-report-source-${src}`}
                  data-count={count}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40"
                >
                  {src}: {count}
                </span>
              ))}
            </div>
          </div>

          {report.metricCoverage.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">
                Metric coverage
              </h3>
              <ul data-testid="env-report-metrics" className="text-xs space-y-1">
                {report.metricCoverage.map((m) => (
                  <li
                    key={m.metricKey}
                    data-testid={`env-report-metric-${m.metricKey}`}
                    className="flex items-center justify-between border-b border-border/20 py-1"
                  >
                    <span>{m.label}</span>
                    <span className="text-muted-foreground">
                      {m.sampleCount} samples · {m.invalidCount} invalid ·{" "}
                      {m.reviewRequiredCount} review
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.topIssues.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">Top issues</h3>
              <ul data-testid="env-report-top-issues" className="space-y-1">
                {report.topIssues.map((issue) => (
                  <li
                    key={issue.ruleId}
                    data-testid={`env-report-issue-${issue.ruleId}`}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px]",
                      SEVERITY_CLASS[issue.severity],
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{issue.label}</span>
                      <span>×{issue.count}</span>
                    </div>
                    <p className="text-[11px] opacity-90">{issue.prompt}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.reviewPrompts.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">
                Review prompts
              </h3>
              <ul
                data-testid="env-report-review-prompts"
                className="text-[11px] text-amber-300 space-y-0.5 list-disc pl-4"
              >
                {report.reviewPrompts.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

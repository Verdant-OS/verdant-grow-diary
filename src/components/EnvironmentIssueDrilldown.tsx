/**
 * EnvironmentIssueDrilldown — presenter-only component for a single
 * top-issue drilldown. Renders the selected issue + related
 * Environment Check entries.
 *
 * No rule calculations. No I/O. No automation. Pure display.
 */
import { cn } from "@/lib/utils";
import type { EnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import type { EnvironmentSummaryTopIssue } from "@/lib/environmentSummaryReportViewModel";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

export interface EnvironmentIssueDrilldownProps {
  issue: EnvironmentSummaryTopIssue;
  relatedChecks: ReadonlyArray<EnvironmentCheckDiaryViewModel>;
  className?: string;
}

function copyFor(checkStatus: string): string | null {
  if (checkStatus === "dst_ambiguous")
    return "DST-ambiguous window — review before acting.";
  if (checkStatus === "invalid")
    return "Invalid environment data — do not use for decisions.";
  return null;
}

export default function EnvironmentIssueDrilldown({
  issue,
  relatedChecks,
  className,
}: EnvironmentIssueDrilldownProps) {
  return (
    <section
      data-testid="env-issue-drilldown"
      data-rule-id={issue.ruleId}
      className={cn(
        "rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3",
        className,
      )}
      aria-label={`Related Environment Checks for ${issue.label}`}
    >
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Related Environment Checks</h3>
          <span
            data-testid="env-issue-drilldown-selected"
            className="text-[10px] uppercase tracking-wide rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5"
          >
            Selected: {issue.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          These entries contributed to this report issue.
        </p>
        <p className="text-[11px] text-muted-foreground">{issue.prompt}</p>
      </header>

      {relatedChecks.length === 0 ? (
        <p
          data-testid="env-issue-drilldown-empty"
          className="text-xs text-muted-foreground"
        >
          No related Environment Checks found for this issue.
        </p>
      ) : (
        <ul data-testid="env-issue-drilldown-list" className="space-y-2">
          {relatedChecks.map((c) => {
            const reviewCopy = copyFor(c.status);
            const annotation = c.ruleAnnotations.find(
              (a) => a.ruleId === issue.ruleId,
            );
            return (
              <li
                key={c.entryId}
                data-testid={`env-issue-drilldown-row-${c.entryId}`}
                data-status={c.status}
                className="rounded-lg border border-border/40 bg-card/40 p-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatSnapshotTimestamp(c.occurredAt)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {c.statusLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  <span className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border/40">
                    source: {c.sourceLabel}
                  </span>
                  {c.snapshotSummary.map((m) => (
                    <span
                      key={m.metricKey}
                      className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border/40"
                    >
                      {m.label}: {m.valueLabel}
                    </span>
                  ))}
                </div>
                {annotation && (
                  <p className="text-[11px] text-amber-300">{annotation.message}</p>
                )}
                {reviewCopy && (
                  <p
                    data-testid={`env-issue-drilldown-warning-${c.entryId}`}
                    className="text-[11px] text-amber-300"
                  >
                    {reviewCopy}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

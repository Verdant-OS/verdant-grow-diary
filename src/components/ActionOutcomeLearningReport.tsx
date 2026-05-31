/**
 * ActionOutcomeLearningReport — read-only v1 report rendered on Grow Detail.
 * Shows outcome totals, per-metric groupings, and recent grower-recorded
 * examples linking back to ActionDetail / AlertDetail.
 *
 * SAFETY:
 *  - Display only. No writes, no automation, no device control.
 *  - All aggregation lives in src/lib/actionOutcomeLearningRules.ts.
 *  - Copy stays observational. Never claims an action caused / fixed an
 *    issue. Never ranks groups as best / worst.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { actionDetailPath, alertDetailPath } from "@/lib/routes";
import {
  LEARNING_GROUP_SAMPLE_THRESHOLD,
  type ActionOutcomeLearningReport as Report,
} from "@/lib/actionOutcomeLearningRules";

interface Props {
  report: Report;
  /** "loading" | "ready" | "unavailable" — mirrors GrowOutcomesState.status */
  status: "loading" | "ready" | "unavailable";
}

const TOTAL_LABELS: Array<{
  key: "improved" | "unchanged" | "worsened" | "more_data_needed";
  label: string;
}> = [
  { key: "improved", label: "Improved" },
  { key: "unchanged", label: "Unchanged" },
  { key: "worsened", label: "Worsened" },
  { key: "more_data_needed", label: "More data needed" },
];

export default function ActionOutcomeLearningReport({ report, status }: Props) {
  return (
    <section
      className="glass rounded-2xl p-4 mt-4"
      aria-label="Action outcome learning report"
      data-testid="action-outcome-learning-report"
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Outcome Learning Report
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Recorded grower outcomes after completed actions.
        </p>
      </header>

      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          Outcome learning report unavailable.
        </p>
      ) : report.totals.total === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="learning-empty"
        >
          No completed action outcomes recorded yet.
        </p>
      ) : (
        <div className="space-y-4">
          <ul
            className="flex flex-wrap gap-2"
            data-testid="learning-total-chips"
          >
            {TOTAL_LABELS.map(({ key, label }) => (
              <li
                key={key}
                className="rounded-full border border-border/60 bg-secondary/30 px-3 py-1 text-xs"
              >
                <span className="text-muted-foreground">{label}: </span>
                <span className="font-medium" data-testid={`learning-total-${key}`}>
                  {report.totals[key]}
                </span>
              </li>
            ))}
            <li className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
              Total: <span className="font-medium">{report.totals.total}</span>
            </li>
          </ul>

          {report.needs_more_data && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="learning-needs-more-data"
            >
              Early pattern — more outcomes needed before drawing conclusions.
            </p>
          )}

          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              By action type
            </h3>
            <ul className="space-y-2" data-testid="learning-groups">
              {report.groups.map((group) => (
                <li
                  key={group.metric}
                  className="rounded-lg border border-border/40 bg-secondary/20 p-2"
                  data-testid="learning-group"
                  data-metric={group.metric}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{group.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.totals.total} recorded
                    </span>
                    {group.needs_more_data && (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase"
                        data-testid="learning-group-needs-more-data"
                      >
                        More data needed
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Improved {group.totals.improved} · Unchanged{" "}
                    {group.totals.unchanged} · Worsened {group.totals.worsened}
                    {" · More data "}
                    {group.totals.more_data_needed}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-2">
              Groups need at least {LEARNING_GROUP_SAMPLE_THRESHOLD} recorded
              outcomes before patterns are summarized.
            </p>
          </div>

          {report.examples.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Recent examples
              </h3>
              <ul className="space-y-2" data-testid="learning-examples">
                {report.examples.map((ex) => (
                  <li
                    key={
                      ex.diary_entry_id ??
                      `${ex.action_queue_id ?? "anon"}-${ex.recorded_at ?? ""}`
                    }
                    className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {ex.outcome_label}
                      </Badge>
                      {ex.metric && (
                        <span className="text-[11px] text-muted-foreground">
                          metric: {ex.metric}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {ex.recorded_at
                          ? new Date(ex.recorded_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                    {ex.suggested_change && (
                      <p className="text-xs mt-1 text-foreground/80">
                        {ex.suggested_change}
                      </p>
                    )}
                    {ex.note_summary && (
                      <p className="text-xs mt-1 italic text-muted-foreground">
                        {ex.note_summary}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs">
                      {ex.action_queue_id && (
                        <Link
                          to={actionDetailPath(ex.action_queue_id)}
                          className="text-primary hover:underline"
                          data-testid="learning-example-action-link"
                        >
                          View action →
                        </Link>
                      )}
                      {ex.source_alert_id && (
                        <Link
                          to={alertDetailPath(ex.source_alert_id)}
                          className="text-primary hover:underline"
                          data-testid="learning-example-alert-link"
                        >
                          View alert →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

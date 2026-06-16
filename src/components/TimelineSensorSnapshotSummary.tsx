/**
 * TimelineSensorSnapshotSummary — presenter-only compact summary for an
 * attached sensor snapshot on a Quick Log timeline card.
 *
 * Hard constraints:
 *  - Presenter only. ALL mapping (metric ordering, unit, severity,
 *    suspicious-value flags, source label) lives in
 *    `timelineSnapshotSummaryViewModel.ts` and the existing
 *    `sensorSourceLabelRules` / `manualSensorSnapshotQualityRules`.
 *  - Source badge uses `<SensorSourceBadge>` so demo can never visually
 *    pass as live and `manual`/`csv`/`stale`/`invalid` keep their true
 *    labels.
 *  - Stale / invalid snapshots render with the existing warning
 *    treatment (border + "Not trustworthy" pill + warning copy).
 *  - When no snapshot input is provided, renders the canonical neutral
 *    "No sensor snapshot attached" note.
 *  - Never renders raw_payload, private IDs, or vendor metadata other
 *    than the existing vendor-promoted source label.
 *  - No reads, no writes, no Supabase, no AI calls, no Action Queue.
 */
import { AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import {
  buildTimelineSnapshotSummary,
  timelineSnapshotHasAnyMetric,
  type TimelineSnapshotInput,
  type TimelineSnapshotSummary,
} from "@/lib/timelineSnapshotSummaryViewModel";
import { MISSING_SNAPSHOT_NOTE_LABEL } from "@/lib/manualSensorSnapshotViewModel";
import type { SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";
import type { ManualSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";

/** Local, presentation-only mapping. Keeps demo/csv/etc. non-healthy. */
function qualityToStatus(q: ManualSnapshotQuality): SnapshotStatus {
  if (q === "usable") return "usable";
  if (q === "invalid") return "invalid";
  if (q === "missing") return "no_data";
  return "needs_review";
}

export const TIMELINE_SNAPSHOT_NOT_TRUSTWORTHY_LABEL =
  "Not trustworthy" as const;

interface Props {
  /**
   * Snapshot input. When null/undefined the neutral missing-snapshot
   * note renders.
   */
  input: TimelineSnapshotInput | null | undefined;
  className?: string;
}

function severityIcon(severity: TimelineSnapshotSummary["severity"]) {
  if (severity === "invalid")
    return <XCircle className="h-3.5 w-3.5" aria-hidden />;
  if (severity === "warning")
    return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
  return null;
}

export default function TimelineSensorSnapshotSummary({ input, className }: Props) {
  if (!input) {
    return (
      <p
        data-testid="timeline-snapshot-summary-missing"
        className={cn("text-xs text-muted-foreground italic", className)}
      >
        {MISSING_SNAPSHOT_NOTE_LABEL}
      </p>
    );
  }

  const summary = buildTimelineSnapshotSummary(input);
  const hasMetrics = timelineSnapshotHasAnyMetric(summary);
  const notTrustworthy =
    summary.severity === "invalid" ||
    summary.source === "stale" ||
    summary.source === "invalid" ||
    summary.source === "demo";

  const status = qualityToStatus(summary.quality.quality);

  return (
    <section
      data-testid="timeline-snapshot-summary"
      data-source={summary.source}
      data-source-label={summary.sourceLabel}
      data-severity={summary.severity}
      data-trustworthy={summary.trustworthy ? "true" : "false"}
      aria-label="Sensor snapshot summary"
      className={cn(
        "rounded-md border bg-secondary/10 p-2 space-y-2",
        summary.severity === "invalid" && "border-destructive/50",
        summary.severity === "warning" && "border-amber-500/40",
        summary.severity === "ok" && "border-border/40",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <SensorSourceBadge
          source={
            summary.source === "unknown" ? "invalid" : summary.source
          }
          status={status}
          vendor={summary.sourceResolved.vendor}
          testId="timeline-snapshot-summary-source-badge"
        />
        {notTrustworthy && (
          <Badge
            variant="outline"
            className="gap-1 border-destructive/40 text-destructive"
            data-testid="timeline-snapshot-summary-not-trustworthy"
          >
            {severityIcon(summary.severity)} {TIMELINE_SNAPSHOT_NOT_TRUSTWORTHY_LABEL}
          </Badge>
        )}
      </header>

      {hasMetrics ? (
        <ul
          className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs"
          data-testid="timeline-snapshot-summary-metrics"
        >
          {summary.metrics.map((m) => (
            <li
              key={m.key}
              data-testid="timeline-snapshot-summary-metric"
              data-metric={m.key}
              data-suspicious={m.suspicious ? "true" : "false"}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1 bg-secondary/20",
                m.suspicious && "border-amber-500/50",
              )}
            >
              <span className="font-medium truncate">{m.label}</span>
              <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                {m.value} {m.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="timeline-snapshot-summary-no-metrics"
        >
          No usable readings.
        </p>
      )}

      {summary.warnings.length > 0 && (
        <ul
          className="space-y-1 text-xs"
          data-testid="timeline-snapshot-summary-warnings"
        >
          {summary.warnings.map((w, i) => (
            <li
              key={`w-${i}`}
              className={cn(
                "flex items-start gap-1.5",
                summary.severity === "invalid"
                  ? "text-destructive"
                  : "text-warning-foreground",
              )}
              data-testid="timeline-snapshot-summary-warning"
            >
              {severityIcon(summary.severity === "invalid" ? "invalid" : "warning")}
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

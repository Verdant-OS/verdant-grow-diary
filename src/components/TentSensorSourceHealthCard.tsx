import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import {
  groupReadingsBySource,
  type SensorReadingInput,
  type SensorSourceSummary,
  type SourceStatus,
} from "@/lib/sensorSourceHealthRules";

/**
 * Tent-scoped presenter for Sensor Source Health.
 *
 * Shows last-received timestamp per source label and marks any source
 * not seen for >30 min as stale. Read-only — no writes, no alerts,
 * no Action Queue, no device control.
 */
export default function TentSensorSourceHealthCard({
  readings,
}: {
  readings: SensorReadingInput[];
}) {
  const summaries = groupReadingsBySource(readings);

  return (
    <div className="glass rounded-2xl p-4 mb-6" data-testid="tent-sensor-source-health-card">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display font-semibold">Sensor Source Health</h2>
      </div>

      {summaries.length === 0 ? (
        <p
          className="text-sm text-muted-foreground py-4 text-center"
          data-testid="tent-sensor-source-health-empty"
        >
          No sensor readings received for this tent yet.
        </p>
      ) : (
        <div className="space-y-2" data-testid="tent-sensor-source-health-list">
          {summaries.map((s) => (
            <SourceRow key={s.sourceLabel} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SourceStatus }) {
  const variants: Record<SourceStatus, { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "bg-green-500/20 text-green-400 border-green-500/40",
    },
    stale: {
      label: "Stale",
      className:
        "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40",
    },
    no_recent_data: {
      label: "No recent data",
      className: "bg-muted text-muted-foreground border-border/50",
    },
  };
  const v = variants[status];
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${v.className}`}
      data-testid="sensor-source-status-badge"
      data-status={status}
    >
      {v.label}
    </Badge>
  );
}

function SourceRow({ summary }: { summary: SensorSourceSummary }) {
  const relativeAge = formatDistanceToNow(new Date(summary.lastReceivedAt), {
    addSuffix: true,
  });

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2"
      data-testid="sensor-source-row"
      data-source={summary.sourceLabel}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{summary.sourceLabel}</span>
        <span className="text-xs text-muted-foreground">
          {relativeAge}
          {summary.metrics.length > 0 && (
            <>
              {" "}
              · {summary.metrics.length} metric{summary.metrics.length > 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>
      <StatusBadge status={summary.status} />
    </div>
  );
}

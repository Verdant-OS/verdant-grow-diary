/**
 * DashboardSensorHealthSummary — read-only presenter for the Sensor Health
 * summary card on the Dashboard. Renders directly from the pure
 * `buildDashboardSensorHealthSummary` view-model. No data fetching, no
 * writes, no AI calls, no device control.
 */
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SENSOR_HEALTH_EMPTY_ALERTS_COPY,
  SENSOR_HEALTH_EMPTY_ALERTS_GUIDANCE,
  type SensorHealthSummary,
} from "@/lib/dashboardSensorHealthViewModel";
import { logsPath, tentsPath } from "@/lib/routes";

interface Props {
  summary: SensorHealthSummary;
  /** Active alert count from useAlertsList. Used to render the calm empty state. */
  activeAlertCount: number;
  /** Optional grow id to wire timeline link. */
  growId: string | null;
  className?: string;
}

const TONE_CLASSES: Record<SensorHealthSummary["tone"], string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border/40 bg-muted/30 text-muted-foreground",
};

function StatusIcon({ status }: { status: SensorHealthSummary["status"] }) {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
    case "watch":
    case "stale":
      return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
    case "invalid":
      return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
    case "loading":
      return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
    case "missing":
    default:
      return <HelpCircle className="h-4 w-4" aria-hidden="true" />;
  }
}

export default function DashboardSensorHealthSummary({
  summary,
  activeAlertCount,
  growId,
  className,
}: Props) {
  const toneClass = TONE_CLASSES[summary.tone];
  const showEmptyAlerts = activeAlertCount === 0;

  return (
    <section
      className={cn("glass rounded-2xl p-4", className)}
      aria-label="Sensor Health summary"
      data-testid="dashboard-sensor-health-summary"
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold">Sensor Health</h2>
          <p className="text-xs text-muted-foreground">
            Snapshot view of your current sensor signal — not a plant-health diagnosis.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            toneClass,
          )}
          data-testid="sensor-health-status-pill"
          data-status={summary.status}
        >
          <StatusIcon status={summary.status} />
          {summary.statusLabel}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium" data-testid="sensor-health-headline">
          {summary.headline}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="sensor-health-body">
          {summary.body}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-secondary/30 px-2 py-0.5 uppercase tracking-wider text-muted-foreground"
            data-testid="sensor-health-source-label"
          >
            Source: {summary.sourceLabel}
          </span>
          {summary.suspiciousFields.length > 0 && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="sensor-health-suspicious"
            >
              Suspicious: {summary.suspiciousFields.join(", ")}
            </span>
          )}
        </div>
        {summary.reasons.length > 0 && (
          <ul
            className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5"
            data-testid="sensor-health-reasons"
          >
            {summary.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
        <div
          className="flex items-start gap-2 text-[11px] text-muted-foreground"
          data-testid="sensor-health-safe-by-design"
        >
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{summary.safeByDesignNote}</span>
        </div>
        {showEmptyAlerts && (
          <div
            className="rounded-lg border border-dashed border-border/50 p-3"
            role="status"
            aria-label="No active alerts"
            data-testid="sensor-health-empty-alerts"
          >
            <p className="text-sm font-medium">{SENSOR_HEALTH_EMPTY_ALERTS_COPY}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {SENSOR_HEALTH_EMPTY_ALERTS_GUIDANCE}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {growId && (
                <Link to={logsPath(growId)} className="text-primary hover:underline">
                  Log a manual reading →
                </Link>
              )}
              <Link to={tentsPath()} className="text-primary hover:underline">
                Review sensor setup →
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

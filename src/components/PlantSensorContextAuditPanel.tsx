/**
 * PlantSensorContextAuditPanel — read-only presenter that summarizes the
 * plant's manual sensor context for AI Doctor.
 *
 * Hard constraints:
 *  - No Supabase, fetch, RPC, alerts, Action Queue, or model calls.
 *  - Business logic lives in `buildPlantSensorContextAuditView`.
 */
import { useMemo } from "react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildPlantSensorContextAuditView,
  type PlantSensorContextStatus,
} from "@/lib/plantSensorContextAuditViewModel";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";

export interface PlantSensorContextAuditPanelProps {
  logs: ReadonlyArray<ManualSensorLog> | null | undefined;
  now?: Date;
}

function statusVariant(
  s: PlantSensorContextStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "strong":
      return "default";
    case "limited":
      return "secondary";
    case "stale":
      return "outline";
    case "missing":
      return "destructive";
  }
}

function statusLabel(s: PlantSensorContextStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PlantSensorContextAuditPanel({
  logs,
  now,
}: PlantSensorContextAuditPanelProps) {
  const view = useMemo(
    () => buildPlantSensorContextAuditView(logs, now ?? new Date()),
    [logs, now],
  );

  return (
    <section
      data-testid="plant-sensor-context-audit-panel"
      className="glass rounded-2xl p-4 my-3 space-y-3"
      aria-label="Sensor context for AI Doctor"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Sensor context for AI Doctor</h3>
        </div>
        <Badge
          variant={statusVariant(view.status)}
          data-testid="plant-sensor-context-audit-status"
        >
          {statusLabel(view.status)}
        </Badge>
      </header>

      <p
        className="text-xs text-muted-foreground"
        data-testid="plant-sensor-context-audit-message"
      >
        {view.message}
      </p>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Recent manual logs</dt>
          <dd
            className="font-medium"
            data-testid="plant-sensor-context-audit-count"
          >
            {view.recentLogCount}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Latest snapshot</dt>
          <dd
            className="font-medium"
            data-testid="plant-sensor-context-audit-latest"
          >
            {view.latestCapturedAt ?? "None"}
          </dd>
        </div>
      </dl>

      {view.metrics.length > 0 && (
        <div
          className="flex flex-wrap gap-1"
          data-testid="plant-sensor-context-audit-metrics"
        >
          {view.metrics.map((m) => (
            <Badge
              key={m.key}
              variant="secondary"
              className="text-[10px]"
              data-testid={`plant-sensor-context-audit-metric-${m.key}`}
            >
              {m.label}
            </Badge>
          ))}
        </div>
      )}

      {view.sources.length > 0 && (
        <div
          className="flex flex-wrap gap-1"
          data-testid="plant-sensor-context-audit-sources"
        >
          {view.sources.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className="text-[10px]"
              data-testid={`plant-sensor-context-audit-source-${s}`}
            >
              {s}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

import { Activity, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import {
  buildSensorSourceHealth,
  formatSourceAge,
  SENSOR_SOURCE_STALE_MINUTES,
  type SensorSourceStatus,
} from "@/lib/sensorSourceHealthRules";

/**
 * Read-only presenter: groups the tent's existing sensor_readings by `source`
 * label and shows whether each source is active (≤30 min) or stale.
 *
 * Never writes, never alerts, never queues actions, never speaks for plant
 * health.
 */

const STATUS_LABEL: Record<SensorSourceStatus, string> = {
  active: "active",
  stale: "stale",
  no_recent_data: "no recent data",
};

function statusBadgeVariant(s: SensorSourceStatus): "default" | "secondary" | "outline" {
  if (s === "active") return "default";
  if (s === "stale") return "secondary";
  return "outline";
}

export default function TentSensorSourceHealthCard({ tentId }: { tentId: string }) {
  const { data: readings = [], isLoading } = useSensorReadings(tentId, 500);
  const sources = buildSensorSourceHealth(readings);

  return (
    <div className="glass rounded-2xl p-4 mt-4" data-testid="tent-sensor-source-health-card">
      <div className="flex items-center gap-2 mb-1">
        <Radio className="size-4 text-muted-foreground" />
        <h2 className="font-display font-semibold">Sensor Source Health</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Per-source freshness for this tent. Sources are marked stale after{" "}
        {SENSOR_SOURCE_STALE_MINUTES} minutes without a new reading. Source status alone
        does not mean the plant or environment is unhealthy.
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : sources.length === 0 ? (
        <div
          className="text-sm text-muted-foreground"
          data-testid="tent-sensor-source-health-empty"
        >
          No sensor readings received for this tent yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {sources.map((s) => (
            <li
              key={s.source}
              className="flex items-center justify-between py-2 gap-2"
              data-testid="tent-sensor-source-health-row"
              data-source={s.source}
              data-status={s.status}
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{s.source}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="size-3" aria-hidden />
                  <span>
                    {formatSourceAge(s.ageMinutes)}
                    {s.lastReceivedAt && (
                      <span className="ml-1 opacity-70" title={new Date(s.lastReceivedAt).toLocaleString()}>
                        · {new Date(s.lastReceivedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </span>
                </div>
                {s.metrics.length > 0 && (
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {s.readingCount} reading{s.readingCount === 1 ? "" : "s"} · {s.metrics.join(", ")}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <Badge variant={statusBadgeVariant(s.status)}>{STATUS_LABEL[s.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

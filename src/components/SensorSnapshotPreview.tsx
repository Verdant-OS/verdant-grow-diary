/**
 * SensorSnapshotPreview — presenter-only. Renders the latest tent sensor
 * snapshot for Quick Log auto-attach.
 *
 * Rules (stop-ship if violated):
 *  - Never marks stale / manual / csv / demo as Live.
 *  - Invalid / missing telemetry is never rendered healthy.
 *  - Color is not the only signal — every state has a text label.
 *  - Warnings/errors are exposed to screen readers.
 *  - No data fetching, no writes, no Supabase imports.
 */
import { Badge } from "@/components/ui/badge";
import {
  SENSOR_FRESH_WINDOW_MINUTES,
  type SensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import { formatLastUpdatedAgo } from "@/lib/lastUpdatedAgo";

export type SensorSnapshotPreviewStatus =
  | "idle"
  | "loading"
  | "empty"
  | "error"
  | "ready";

interface Props {
  status: SensorSnapshotPreviewStatus;
  snapshot: SensorSnapshot;
  attach: boolean;
  canToggle: boolean;
  onToggleAttach?: (next: boolean) => void;
  /**
   * Wall-clock ms epoch of the last successful query refresh. Drives the
   * "Last updated" line. Never implies the data itself is Live — Live /
   * stale / invalid stays on the existing freshness badge.
   */
  lastUpdatedAt?: number | null;
  /** Injected for tests; defaults to Date.now(). */
  nowMs?: number;
}

const STATUS_BADGE_VARIANT: Record<
  SensorSnapshotStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  fresh_live: "default",
  fresh_non_live: "secondary",
  stale: "secondary",
  invalid: "destructive",
  empty: "outline",
};

const STATUS_TONE_CLASS: Record<SensorSnapshotStatus, string> = {
  fresh_live: "text-emerald-700",
  fresh_non_live: "text-foreground",
  stale: "text-amber-700",
  invalid: "text-destructive",
  empty: "text-muted-foreground",
};

function formatMetric(
  key: "temp_f" | "humidity_pct" | "vpd_kpa" | "soil_moisture_pct" | "co2_ppm",
  value: number | null,
): string {
  if (value === null) return "—";
  const r = Math.round(value * 10) / 10;
  switch (key) {
    case "temp_f":
      return `${r}°F`;
    case "humidity_pct":
    case "soil_moisture_pct":
      return `${r}%`;
    case "vpd_kpa":
      return `${r} kPa`;
    case "co2_ppm":
      return `${Math.round(value)} ppm`;
  }
}

const METRIC_LABELS: Record<string, string> = {
  temp_f: "Temp",
  humidity_pct: "RH",
  vpd_kpa: "VPD",
  soil_moisture_pct: "Soil moisture",
  co2_ppm: "CO₂",
};

export function SensorSnapshotPreview({
  status,
  snapshot,
  attach,
  canToggle,
  onToggleAttach,
}: Props) {
  return (
    <section
      aria-labelledby="sensor-snapshot-preview-heading"
      data-testid="sensor-snapshot-preview"
      data-status={status}
      data-snapshot-status={snapshot.status}
      className="rounded-lg border border-border/60 p-3 text-sm space-y-2"
    >
      <header className="flex items-center justify-between gap-2">
        <h3
          id="sensor-snapshot-preview-heading"
          className="text-sm font-semibold"
        >
          Sensor snapshot
        </h3>
        {status === "ready" ? (
          <Badge
            variant={STATUS_BADGE_VARIANT[snapshot.status]}
            data-testid="sensor-snapshot-preview-badge"
            className={STATUS_TONE_CLASS[snapshot.status]}
          >
            {snapshot.badge_label}
          </Badge>
        ) : null}
      </header>

      {status === "loading" ? (
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="sensor-snapshot-preview-loading"
        >
          Loading latest sensor reading…
        </p>
      ) : null}

      {status === "idle" ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="sensor-snapshot-preview-idle"
        >
          Pick a plant or tent to see the latest sensor snapshot.
        </p>
      ) : null}

      {status === "empty" ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="sensor-snapshot-preview-empty"
        >
          No sensor readings yet for this tent.
        </p>
      ) : null}

      {status === "error" ? (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="sensor-snapshot-preview-error"
        >
          Couldn't load the latest sensor reading. Saving still works.
        </p>
      ) : null}

      {status === "ready" ? (
        <>
          <dl
            className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"
            data-testid="sensor-snapshot-preview-metrics"
          >
            {(
              [
                "temp_f",
                "humidity_pct",
                "vpd_kpa",
                "soil_moisture_pct",
                "co2_ppm",
              ] as const
            ).map((key) => {
              const v = snapshot.metrics[key];
              if (key === "co2_ppm" && v === null) return null;
              const detail = snapshot.metricDetails[key];
              const tone =
                v === null
                  ? "text-muted-foreground"
                  : !detail.valid
                    ? "text-destructive"
                    : detail.warn
                      ? "text-amber-700"
                      : "text-foreground";
              return (
                <div key={key} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{METRIC_LABELS[key]}</dt>
                  <dd
                    data-testid={`sensor-snapshot-preview-metric-${key}`}
                    className={tone}
                  >
                    {formatMetric(key, v)}
                    {v !== null && !detail.valid ? " · invalid" : ""}
                    {v !== null && detail.valid && detail.warn ? " · watch" : ""}
                  </dd>
                </div>
              );
            })}
          </dl>

          <p
            className="text-[11px] text-muted-foreground"
            data-testid="sensor-snapshot-preview-meta"
          >
            captured_at: {snapshot.captured_at ?? "unknown"}
            {snapshot.confidence !== null
              ? ` · confidence ${Math.round(snapshot.confidence * 100)}%`
              : ""}
            {" · "}freshness window: {SENSOR_FRESH_WINDOW_MINUTES} min
          </p>

          {snapshot.warnings.length > 0 ? (
            <ul
              role="list"
              aria-label="Sensor snapshot warnings"
              data-testid="sensor-snapshot-preview-warnings"
              className="text-[11px] text-amber-700 space-y-0.5"
            >
              {snapshot.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={attach}
          disabled={!canToggle}
          aria-label={
            attach
              ? "Do not attach sensor snapshot"
              : "Attach sensor snapshot to this entry"
          }
          data-testid="sensor-snapshot-preview-attach-toggle"
          onChange={(e) => onToggleAttach?.(e.target.checked)}
        />
        <span>
          {attach
            ? "Sensor snapshot will be attached to this entry."
            : "Sensor snapshot not attached."}
        </span>
      </label>
    </section>
  );
}

export default SensorSnapshotPreview;

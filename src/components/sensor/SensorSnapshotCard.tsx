/**
 * SensorSnapshotCard — presenter-only card for a single sensor snapshot.
 *
 * Renders provenance badge, captured age, metric rows, and any suspicious
 * metric warnings. Never reads healthy for invalid/stale/demo/unknown.
 */
import { cn } from "@/lib/utils";
import SensorSourceBadge from "@/components/sensor/SensorSourceBadge";
import {
  classifySnapshotFreshness,
  type SensorSnapshot,
  type ClassifyOptions,
} from "@/lib/sensor/sensorSnapshotFreshnessRules";
import { detectSuspiciousMetrics } from "@/lib/sensor/sensorMetricSafetyRules";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

export interface SensorSnapshotCardProps {
  snapshot: SensorSnapshot;
  classifyOptions?: ClassifyOptions;
  className?: string;
  testId?: string;
}

const METRIC_DISPLAY: Array<{ key: string; label: string; unit?: string }> = [
  { key: "temp_f", label: "Temp", unit: "°F" },
  { key: "rh", label: "RH", unit: "%" },
  { key: "vpd", label: "VPD", unit: "kPa" },
  { key: "soil_moisture", label: "Soil", unit: "%" },
  { key: "ec", label: "EC", unit: "mS/cm" },
  { key: "ph", label: "pH" },
];

export default function SensorSnapshotCard({
  snapshot,
  classifyOptions,
  className,
  testId = "sensor-snapshot-card",
}: SensorSnapshotCardProps) {
  const freshness = classifySnapshotFreshness(snapshot, classifyOptions);
  const flags = detectSuspiciousMetrics(snapshot.metrics);

  const demo = freshness.source === "demo";
  const degraded = freshness.isDegraded;

  return (
    <div
      data-testid={testId}
      data-source={freshness.source}
      data-freshness={freshness.freshness}
      data-degraded={degraded ? "true" : "false"}
      className={cn(
        "rounded-md border bg-card px-3 py-2 text-xs space-y-2",
        freshness.freshness === "invalid"
          ? "border-red-500/40"
          : degraded
            ? "border-amber-500/40"
            : "border-border",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SensorSourceBadge source={freshness.source} />
        <span
          data-testid={`${testId}-age`}
          className="text-[11px] text-muted-foreground"
        >
          {freshness.ageLabel}
        </span>
        {demo && (
          <span
            data-testid={`${testId}-demo-notice`}
            className="text-[11px] font-medium text-amber-700 dark:text-amber-300"
          >
            Sample / demo data — not live tent data
          </span>
        )}
      </div>

      <ul
        data-testid={`${testId}-metrics`}
        className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3"
      >
        {METRIC_DISPLAY.map(({ key, label, unit }) => {
          const value = snapshot.metrics[key];
          const display =
            typeof value === "number" && Number.isFinite(value)
              ? `${value}${unit ? ` ${unit}` : ""}`
              : "—";
          return (
            <li
              key={key}
              data-testid={`${testId}-metric-${key}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums">{display}</span>
            </li>
          );
        })}
      </ul>

      {flags.length > 0 && (
        <ul
          data-testid={`${testId}-warnings`}
          className="space-y-1 border-t border-amber-500/30 pt-2"
        >
          {flags.map((flag) => (
            <li
              key={`${flag.metric}-${flag.code}`}
              data-testid={`${testId}-warning-${flag.code}`}
              role="status"
              className="text-[11px] text-amber-700 dark:text-amber-300"
            >
              ⚠ {flag.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

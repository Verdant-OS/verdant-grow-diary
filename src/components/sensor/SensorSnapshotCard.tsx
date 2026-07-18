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

export interface SensorSnapshotEditHistoryEntry {
  id: string;
  changed_at: string;
  changed_fields: string[];
  old_values: Record<string, number>;
  new_values: Record<string, number>;
  change_reason: string | null;
  source_before: "manual";
  source_after: "manual";
}

export interface SensorSnapshotCardProps {
  snapshot: SensorSnapshot;
  classifyOptions?: ClassifyOptions;
  className?: string;
  testId?: string;
  /**
   * Optional edit history for a manual snapshot. Presenter-only; parent
   * fetches. When empty/undefined a clean empty state is rendered only
   * for manual snapshots (never for live/csv/demo/…).
   */
  edits?: SensorSnapshotEditHistoryEntry[];
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
  edits,
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
        <SensorSourceBadge
          source={freshness.source}
          quality={flags.length > 0 ? "invalid" : snapshot.quality}
          freshness={freshness.freshness}
        />
        <span data-testid={`${testId}-age`} className="text-[11px] text-muted-foreground">
          {freshness.ageLabel}
        </span>
        <span
          data-testid={`${testId}-captured-at`}
          title={snapshot.captured_at ?? undefined}
          aria-label={
            snapshot.captured_at
              ? `Captured: ${formatSnapshotTimestamp(snapshot.captured_at)} (${snapshot.captured_at})`
              : "Captured: Unknown time"
          }
          className="text-[11px] text-muted-foreground"
        >
          {`Captured: ${formatSnapshotTimestamp(snapshot.captured_at)}`}
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

      {freshness.source === "manual" && (
        <section
          data-testid={`${testId}-edit-history`}
          aria-label="Manual sensor snapshot edit history"
          className="border-t border-border/60 pt-2 space-y-1"
        >
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Edit history
          </h4>
          {!edits || edits.length === 0 ? (
            <p
              data-testid={`${testId}-edit-history-empty`}
              className="text-[11px] text-muted-foreground italic"
            >
              No corrections recorded.
            </p>
          ) : (
            <ul data-testid={`${testId}-edit-history-list`} className="space-y-1.5">
              {edits.map((e) => (
                <li
                  key={e.id}
                  data-testid={`${testId}-edit-history-entry`}
                  data-source-before={e.source_before}
                  data-source-after={e.source_after}
                  className="rounded-md border border-border/40 bg-secondary/10 p-1.5 text-[11px] space-y-1"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-muted-foreground">
                      Edited {formatSnapshotTimestamp(e.changed_at)}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wide text-muted-foreground"
                      data-testid={`${testId}-edit-history-entry-source`}
                    >
                      Source: manual → manual
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {e.changed_fields.map((f) => (
                      <li
                        key={f}
                        data-testid={`${testId}-edit-history-field-${f}`}
                        className="flex items-baseline justify-between gap-2 font-mono"
                      >
                        <span className="text-muted-foreground">{f}</span>
                        <span className="tabular-nums">
                          {e.old_values[f] ?? "—"} → {e.new_values[f] ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {e.change_reason && (
                    <p
                      data-testid={`${testId}-edit-history-entry-reason`}
                      className="text-[11px] text-foreground/90"
                    >
                      Reason: {e.change_reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

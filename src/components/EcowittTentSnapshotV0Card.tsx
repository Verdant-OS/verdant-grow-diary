/**
 * EcowittTentSnapshotV0Card — presenter for locked EcoWitt one-tent Sensor
 * Snapshot V0. Exactly three metrics (air temp, air RH, soil moisture),
 * each with a constitution Sensor Truth badge + captured_at, plus a 24h
 * sparkline. Quiet bridge → "No live data". Never fakes live.
 *
 * Stateless presenter: all classification lives in
 * ecowittTentSnapshotV0Rules / ecowittTentSnapshotV0ViewModel.
 */
import { useMemo } from "react";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { buildEcowittTentSnapshotV0ViewModel } from "@/lib/ecowittTentSnapshotV0ViewModel";
import type { EcowittTentSnapshotV0MetricView } from "@/lib/ecowittTentSnapshotV0ViewModel";
import {
  convertCelsiusForDisplay,
  getTemperatureUnitSymbol,
} from "@/lib/temperatureUnitPreference";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import { cn } from "@/lib/utils";

export interface EcowittTentSnapshotV0CardProps {
  tentId: string | null | undefined;
  className?: string;
  /** Injected clock for deterministic tests. */
  now?: Date;
}

function formatCapturedAt(iso: string | null): string {
  if (!iso) return "Captured: —";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Captured: —";
  try {
    return `Captured: ${new Date(t).toLocaleString()}`;
  } catch {
    return `Captured: ${iso}`;
  }
}

function badgeClass(truth: EcowittTentSnapshotV0MetricView["truthSource"]): string {
  switch (truth) {
    case "live":
      return "border-primary/40 text-foreground";
    case "stale":
      return "border-[hsl(var(--warning))] text-[hsl(var(--warning))]";
    case "invalid":
      return "border-destructive text-destructive";
    case "demo":
      return "border-amber-500/40 text-amber-700 dark:text-amber-300";
    case "manual":
    case "csv":
      return "border-border text-muted-foreground";
    case "none":
    default:
      return "border-border text-muted-foreground";
  }
}

function MetricSparkline({
  points,
  state,
  testId,
}: {
  points: EcowittTentSnapshotV0MetricView["sparkline"];
  state: EcowittTentSnapshotV0MetricView["sparklineState"];
  testId: string;
}) {
  if (points.length === 0 || state === "empty") {
    return (
      <div
        className="mt-2 h-8 rounded bg-secondary/40"
        data-testid={testId}
        data-sparkline-state="empty"
        aria-label="No 24h sparkline data"
      />
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((v, i) => {
      const x = values.length === 1 ? 50 : (i / (values.length - 1)) * 100;
      const y = 32 - ((v - min) / span) * 28;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 36"
      className="mt-2 h-9 w-full"
      role="img"
      aria-label={`24h ${state} sparkline`}
      data-testid={testId}
      data-sparkline-state={state}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  );
}

export function EcowittTentSnapshotV0Card(props: EcowittTentSnapshotV0CardProps) {
  const { tentId, className, now } = props;
  // Oversample so 24h history can populate sparklines for ~60s EcoWitt cadence.
  const readingsQuery = useSensorReadings(tentId ?? null, 1500);
  const temperatureUnit = useTemperatureUnitPreference();
  const temperatureSymbol = getTemperatureUnitSymbol(temperatureUnit);

  const vm = useMemo(
    () =>
      buildEcowittTentSnapshotV0ViewModel(readingsQuery.data ?? [], {
        tentId: tentId ?? null,
        now,
      }),
    [readingsQuery.data, tentId, now],
  );

  return (
    <section
      aria-label="EcoWitt tent sensor snapshot"
      data-testid="ecowitt-tent-snapshot-v0"
      data-bridge-quiet={vm.bridgeQuiet ? "true" : "false"}
      className={cn("rounded-lg border border-border bg-card p-4 text-card-foreground", className)}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Sensor Snapshot</h3>
          <p className="text-xs text-muted-foreground">
            Air temp, air RH, soil moisture — latest packet and last 24 hours.
          </p>
        </div>
        <span
          data-testid="ecowitt-tent-snapshot-v0-overall-badge"
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            badgeClass(vm.overallTruthSource),
          )}
        >
          {vm.overallBadgeLabel}
        </span>
      </header>

      {readingsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground" data-testid="ecowitt-tent-snapshot-v0-loading">
          Loading sensor readings…
        </p>
      ) : null}

      {readingsQuery.isError ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-testid="ecowitt-tent-snapshot-v0-error"
        >
          Couldn’t load sensor readings. Check your connection and try again.
        </p>
      ) : null}

      {!readingsQuery.isLoading && !readingsQuery.isError && vm.quietMessage ? (
        <p
          className="mb-3 rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground"
          role="status"
          data-testid="ecowitt-tent-snapshot-v0-quiet"
        >
          {vm.quietMessage}
        </p>
      ) : null}

      {!readingsQuery.isLoading && !readingsQuery.isError ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {vm.metrics.map((metric) => {
            const displayValue =
              metric.key === "temp" && metric.value !== null
                ? convertCelsiusForDisplay(metric.value, temperatureUnit)
                : metric.value;
            const unit = metric.key === "temp" ? temperatureSymbol : metric.unit;
            return (
              <div
                key={metric.key}
                className="rounded-md border border-border/60 p-3"
                data-testid={`ecowitt-tent-snapshot-v0-metric-${metric.key}`}
                data-truth={metric.truthSource}
              >
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      badgeClass(metric.truthSource),
                    )}
                    data-testid={`ecowitt-tent-snapshot-v0-badge-${metric.key}`}
                  >
                    {metric.badgeLabel}
                  </span>
                </div>
                <dd
                  className="mt-1 font-display text-xl tabular-nums"
                  data-testid={`ecowitt-tent-snapshot-v0-value-${metric.key}`}
                >
                  {displayValue === null || !Number.isFinite(displayValue)
                    ? "—"
                    : `${metric.key === "temp" ? displayValue.toFixed(1) : Math.round(displayValue)} ${unit}`}
                </dd>
                <p
                  className="mt-1 text-[11px] text-muted-foreground"
                  data-testid={`ecowitt-tent-snapshot-v0-captured-${metric.key}`}
                >
                  {formatCapturedAt(metric.capturedAt)}
                </p>
                {metric.reason ? (
                  <p
                    className="mt-0.5 text-[11px] text-destructive"
                    data-testid={`ecowitt-tent-snapshot-v0-reason-${metric.key}`}
                  >
                    {metric.reason}
                  </p>
                ) : null}
                <MetricSparkline
                  points={metric.sparkline}
                  state={metric.sparklineState}
                  testId={`ecowitt-tent-snapshot-v0-spark-${metric.key}`}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default EcowittTentSnapshotV0Card;

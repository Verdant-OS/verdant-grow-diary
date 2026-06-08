/**
 * QuickLogSensorMiniChart — compact sparkline of the last ~24h of
 * sensor readings for the active tent. Presenter-only.
 *
 * Reads rows via `useRecentTentSensorSeries`, derives series + SVG path
 * via the pure helpers in `quickLogSensorMiniChartRules`. Never promotes
 * a reading to Live, never writes, never alerts.
 */
import { useMemo } from "react";
import { useRecentTentSensorSeries } from "@/hooks/useRecentTentSensorSeries";
import {
  buildMiniChartPath,
  buildMiniChartSeries,
  type MiniChartMetric,
} from "@/lib/quickLogSensorMiniChartRules";

interface Props {
  tentId: string | null | undefined;
  metric?: MiniChartMetric;
}

const VIEW_W = 240;
const VIEW_H = 36;

const LABEL: Record<MiniChartMetric, string> = {
  temp_c: "Temp",
  humidity_pct: "RH",
  vpd_kpa: "VPD",
};

export default function QuickLogSensorMiniChart({ tentId, metric = "temp_c" }: Props) {
  const { status, rows } = useRecentTentSensorSeries(tentId);
  const series = useMemo(
    () => buildMiniChartSeries(rows, { metric }),
    [rows, metric],
  );
  const path = useMemo(
    () => buildMiniChartPath(series, { width: VIEW_W, height: VIEW_H, padding: 3 }),
    [series],
  );

  if (!tentId) return null;
  if (status === "idle" || status === "loading") return null;
  if (status === "error" || status === "empty" || !path || series.points.length < 2) {
    return null;
  }

  const latestLabel =
    series.latestValue !== null
      ? `${series.latestValue.toFixed(metric === "vpd_kpa" ? 2 : metric === "humidity_pct" ? 0 : 1)}${series.unitLabel}`
      : "—";
  const rangeLabel = `${series.min.toFixed(metric === "vpd_kpa" ? 2 : metric === "humidity_pct" ? 0 : 1)}–${series.max.toFixed(metric === "vpd_kpa" ? 2 : metric === "humidity_pct" ? 0 : 1)}${series.unitLabel}`;

  return (
    <figure
      data-testid="quicklog-sensor-mini-chart"
      data-metric={metric}
      data-points={series.points.length}
      className="rounded-md border border-border/40 bg-secondary/20 p-2"
      aria-label={`${LABEL[metric]} trend, last 24 hours. Latest ${latestLabel}, range ${rangeLabel}.`}
    >
      <figcaption className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{LABEL[metric]} · 24h</span>
        <span data-testid="quicklog-sensor-mini-chart-latest">{latestLabel}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        role="img"
        aria-hidden="true"
        className="mt-1 block"
        preserveAspectRatio="none"
      >
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="quicklog-sensor-mini-chart-range">
        Range {rangeLabel}
      </p>
    </figure>
  );
}

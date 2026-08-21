import MetricChip from "@/components/MetricChip";
import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import type { TentManualSnapshotUnavailableReason } from "@/lib/tentManualSnapshotBatchRules";
import type { TentSensorReadStatus } from "@/hooks/use-sensor-readings";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import {
  selectTentEnvironmentSnapshotFallback,
  type TentEnvironmentReadStatus,
} from "@/lib/tentEnvironmentSnapshotFallbackRules";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";

export interface TentEnvironmentSnapshotStripProps {
  tentId: string;
  stage: string | null | undefined;
  sensorRows: readonly BuildTentSnapshotInput[];
  sensorStatus: TentSensorReadStatus;
  now: number;
  temperatureUnit: TemperatureUnitPreference;
  manualCards: readonly ManualSnapshotTimelineCard[];
  manualStatus: TentEnvironmentReadStatus;
  manualUnavailableReason?: TentManualSnapshotUnavailableReason | null;
}

export default function TentEnvironmentSnapshotStrip({
  tentId,
  stage,
  sensorRows,
  sensorStatus,
  now,
  temperatureUnit,
  manualCards,
  manualStatus,
  manualUnavailableReason,
}: TentEnvironmentSnapshotStripProps) {
  const selection = selectTentEnvironmentSnapshotFallback({
    sensorRows,
    sensorStatus,
    manualCards,
    manualStatus,
  });

  if (selection.kind === "sensor_loading") {
    return (
      <p
        className="text-xs text-muted-foreground animate-pulse"
        data-testid={`tents-list-sensor-loading-${tentId}`}
      >
        Loading sensor data…
      </p>
    );
  }
  if (selection.kind === "sensor_unavailable") {
    return sensorStatus === "refresh_error" ? (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-empty-${tentId}`}
      >
        Last loaded result had no readings; refresh unavailable.
      </p>
    ) : (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-unavailable-${tentId}`}
      >
        Sensor data unavailable — readings couldn't be loaded.
      </p>
    );
  }
  if (selection.kind === "manual_loading") {
    return (
      <p
        className="text-xs text-muted-foreground animate-pulse"
        data-testid={`tents-list-manual-loading-${tentId}`}
      >
        Loading saved manual snapshot…
      </p>
    );
  }
  if (selection.kind === "manual_unavailable") {
    const unavailableCopy =
      manualUnavailableReason === "cap_exhausted"
        ? "Manual snapshot unavailable — the saved-reading scan reached its safe limit."
        : manualUnavailableReason === "concurrency_ambiguous"
          ? "Manual snapshot unavailable — saved readings changed during this check."
          : "Manual snapshot unavailable — saved readings couldn't be loaded.";
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-manual-unavailable-${tentId}`}
        data-unavailable-reason={manualUnavailableReason ?? undefined}
      >
        {unavailableCopy}
      </p>
    );
  }
  if (selection.kind === "manual_unusable") {
    return (
      <div className="space-y-1">
        {selection.refreshWarning ? (
          <p
            className="text-xs text-amber-600"
            data-testid={`tents-list-manual-refresh-stale-${tentId}`}
          >
            Refresh unavailable — last loaded manual snapshot checked.
          </p>
        ) : null}
        <p
          className={
            selection.severity === "invalid"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
          data-testid={`tents-list-manual-unusable-${tentId}`}
        >
          Saved manual snapshot has no compatible direct air readings to show here.
        </p>
      </div>
    );
  }
  if (selection.kind === "empty") {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-empty-${tentId}`}
      >
        No sensor data yet
      </p>
    );
  }

  const snapView = buildTentSnapshotView(selection.rows, stage, now, { temperatureUnit });
  const vpdMetric = snapView.metrics.find((metric) => metric.key === "vpd");
  const hasVpdValue = !!vpdMetric && vpdMetric.status !== "unknown";

  if (!snapView.hasReading) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-empty-${tentId}`}
      >
        No sensor data yet
      </p>
    );
  }

  return (
    <>
      {selection.refreshWarning ? (
        <p
          className="text-xs text-amber-600"
          data-testid={
            selection.kind === "manual"
              ? `tents-list-manual-refresh-stale-${tentId}`
              : `tents-list-sensor-refresh-stale-${tentId}`
          }
        >
          {selection.kind === "manual"
            ? "Refresh unavailable — last loaded manual snapshot shown."
            : "Refresh unavailable — last loaded readings shown."}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {snapView.metrics.map((metric) => (
          <div
            key={metric.key}
            data-testid={`tents-list-metric-${tentId}-${metric.key}`}
            data-status={metric.status}
            className="inline-flex items-center gap-1"
          >
            <MetricChip
              label={metric.key === "temp" ? "T" : metric.key === "rh" ? "RH" : "VPD"}
              value={metric.display}
              unit={metric.unit}
              status={metric.chipStatus}
            />
            {metric.statusLabel ? (
              <span
                data-testid={`tents-list-metric-status-${tentId}-${metric.key}`}
                className={
                  metric.status === "invalid"
                    ? "text-[10px] uppercase tracking-wide text-destructive"
                    : metric.status === "stale"
                      ? "text-[10px] uppercase tracking-wide text-amber-600"
                      : "text-[10px] uppercase tracking-wide text-muted-foreground"
                }
              >
                {metric.statusLabel}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span
          data-testid={`tents-list-sensor-source-${tentId}`}
          data-source-label={snapView.sourceLabel}
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide border-border/50 bg-secondary/40"
        >
          {snapView.sourceLabel}
        </span>
        <span
          data-testid={`tents-list-sensor-last-updated-${tentId}`}
          data-captured-at={snapView.lastUpdatedIso ?? undefined}
        >
          Last updated {snapView.lastUpdatedDisplay}
        </span>
      </div>
      {hasVpdValue && snapView.canAssessStage && normalizeVpdStage(stage) === "unknown" ? (
        <VpdStageMissingBadge testId="tents-list-vpd-stage-missing-badge" />
      ) : null}
    </>
  );
}

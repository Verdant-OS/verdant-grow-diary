import type { SensorReading } from "@/mock";
import type { ManualHistoryReadState } from "@/lib/vpdStabilityInputRules";
import { selectTentEnvironmentManualDisplay } from "@/lib/tentEnvironmentDisplayRules";
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
  type TentEnvironmentManualReadStatus,
  type TentEnvironmentReadStatus,
} from "@/lib/tentEnvironmentSnapshotFallbackRules";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";
import { tentsListCanonicalVpd, tentsListDiarySnapshotRows } from "@/lib/tentsListVpdRules";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

export interface TentEnvironmentSnapshotStripProps {
  tentId: string;
  quickLogManualReadings?: readonly SensorReading[];
  quickLogManualReadState?: ManualHistoryReadState;
  /**
   * The tent's Dashboard diary-inclusive snapshot (`useLatestSensorSnapshotsByTent`),
   * read once at page level and passed down, never fetched per card (#2268;
   * Codex P2 on #2303 at 0c19a9e0). Idle when the page has none for this tent.
   */
  tonightSnapshot?: SnapshotState;
  stage: string | null | undefined;
  sensorRows: readonly BuildTentSnapshotInput[];
  sensorStatus: TentSensorReadStatus;
  now: number;
  temperatureUnit: TemperatureUnitPreference;
  manualCards: readonly ManualSnapshotTimelineCard[];
  manualStatus: TentEnvironmentManualReadStatus;
  manualUnavailableReason?: TentManualSnapshotUnavailableReason | null;
}

const IDLE_SNAPSHOT: SnapshotState = { status: "idle", snapshot: EMPTY_SNAPSHOT };

export default function TentEnvironmentSnapshotStrip({
  tentId,
  quickLogManualReadings,
  quickLogManualReadState = "ready",
  tonightSnapshot = IDLE_SNAPSHOT,
  stage,
  sensorRows,
  sensorStatus,
  now,
  temperatureUnit,
  manualCards,
  manualStatus,
  manualUnavailableReason,
}: TentEnvironmentSnapshotStripProps) {
  const manualDisplay =
    sensorStatus === "loading" || sensorStatus === "error"
      ? null
      : selectTentEnvironmentManualDisplay({
          tentId,
          sensorRows,
          manualReadings: quickLogManualReadings,
          now,
          sensorStatus,
          snapshot: { status: tonightSnapshot.status, snapshot: tonightSnapshot.snapshot },
        });
  const manualHistoryNotice =
    quickLogManualReadState === "ready" ? null : (
      <p className="text-xs text-muted-foreground" role="status">
        {quickLogManualReadState === "unavailable"
          ? "Quick Log manual history unavailable — only last loaded readings can be shown."
          : "Checking Quick Log manual history — saved readings are still loading."}
      </p>
    );
  const storedSelection = selectTentEnvironmentSnapshotFallback({
    sensorRows,
    sensorStatus,
    manualCards,
    manualStatus,
    now,
  });
  const selection = manualDisplay
    ? {
        kind: "sensor" as const,
        rows: manualDisplay.rows,
        refreshWarning: sensorStatus === "refresh_error",
      }
    : storedSelection;

  // A failed raw read is not "unavailable" while the Dashboard's own snapshot
  // read, which may still back it, is in flight (Codex P2 on #2303 at 0994ea2a).
  if (
    selection.kind === "sensor_loading" ||
    (selection.kind === "sensor_unavailable" && tonightSnapshot.status === "loading")
  ) {
    return (
      <p
        className="text-xs text-muted-foreground animate-pulse"
        data-testid={`tents-list-sensor-loading-${tentId}`}
      >
        Loading sensor data…
      </p>
    );
  }
  // The raw read failed but the Dashboard's own snapshot read resolved a
  // capture: show that capture, as the Dashboard and Tent Detail do, rather
  // than claim nothing could be loaded (Codex P2 on #2303 at fa8edcff).
  const diaryRows = tentsListDiarySnapshotRows(
    { status: tonightSnapshot.status, snapshot: tonightSnapshot.snapshot },
    tentId,
    now,
  );
  // A successful snapshot whose every row was rejected has no `ts`, so it
  // yields no rows, but its rejection evidence still decides the VPD, as it
  // does on the Dashboard (Codex P2 on #2430 at fcd86356).
  // A failed or air-less manual card does not hide it either (Copilot on
  // #2442 at e50d6087).
  const rejectedOnlyVpd =
    diaryRows.length === 0 &&
    (selection.kind === "sensor_unavailable" ||
      selection.kind === "empty" ||
      selection.kind === "manual_unavailable" ||
      selection.kind === "manual_unusable") &&
    tonightSnapshot.status === "ok"
      ? tentsListCanonicalVpd(
          [],
          tentId,
          now,
          { status: "ok", snapshot: tonightSnapshot.snapshot },
          sensorStatus,
        )
      : null;
  if (rejectedOnlyVpd?.rejected) {
    return (
      <p className="text-xs text-destructive" data-testid={`tents-list-vpd-rejected-${tentId}`}>
        VPD invalid — the latest VPD reading did not pass a sensor check.
      </p>
    );
  }
  if (selection.kind === "sensor_unavailable" && diaryRows.length === 0) {
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
  // A failed manual read does not hide a successful Dashboard snapshot; that
  // snapshot backs the card instead (Codex P2 on #2303 at 6a242e1f).
  if (selection.kind === "manual_unavailable" && diaryRows.length === 0) {
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
  // A manual card with no air readings does not hide a diary capture the
  // Dashboard shows for this tent (Codex P2 on #2407 at e66265eb).
  if (selection.kind === "manual_unusable" && diaryRows.length === 0) {
    return (
      <div className="space-y-1">
        {selection.refreshing ? (
          <p
            className="text-xs text-muted-foreground animate-pulse"
            data-testid={`tents-list-manual-refreshing-${tentId}`}
          >
            Refreshing saved manual snapshot…
          </p>
        ) : null}
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
  // No stored rows and no manual card: the Dashboard's diary-inclusive
  // snapshot may still hold a Quick Log or Environment Check capture for this
  // tent, which is what the Dashboard shows (Codex P2 on #2303 at 69de43db).
  // Until that read resolves, say so rather than claiming absence; a failed
  // read is unavailable, not empty (Codex P2 on #2303 at 85ec1e78).
  if (selection.kind === "empty" && tonightSnapshot.status === "loading") {
    return (
      <p
        className="text-xs text-muted-foreground animate-pulse"
        data-testid={`tents-list-sensor-loading-${tentId}`}
      >
        Loading sensor data…
      </p>
    );
  }
  if (selection.kind === "empty" && tonightSnapshot.status === "unavailable") {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-unavailable-${tentId}`}
      >
        Sensor data unavailable — readings couldn't be loaded.
      </p>
    );
  }
  const rows =
    selection.kind === "empty" ||
    selection.kind === "sensor_unavailable" ||
    selection.kind === "manual_unavailable" ||
    selection.kind === "manual_unusable"
      ? diaryRows
      : selection.rows;
  if (rows.length === 0) {
    if (manualHistoryNotice) return manualHistoryNotice;
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid={`tents-list-sensor-empty-${tentId}`}
      >
        No sensor data yet
      </p>
    );
  }

  const snapView = buildTentSnapshotView(rows, stage, now, {
    temperatureUnit,
    // An admitted Quick Log observation keeps Detail's value and provenance.
    // Otherwise use Tonight's raw/snapshot inputs, never the display fallback
    // rows (Codex P1 on #2437, Copilot on #2442).
    canonicalVpd:
      manualDisplay?.canonicalVpd ??
      tentsListCanonicalVpd(
        sensorRows,
        tentId,
        now,
        { status: tonightSnapshot.status, snapshot: tonightSnapshot.snapshot },
        sensorStatus,
      ),
  });
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
      {manualHistoryNotice}
      {selection.kind === "manual" && selection.refreshing ? (
        <p
          className="text-xs text-muted-foreground animate-pulse"
          data-testid={`tents-list-manual-refreshing-${tentId}`}
        >
          Refreshing saved manual snapshot…
        </p>
      ) : null}
      {(selection.kind === "sensor" || selection.kind === "manual") && selection.refreshWarning ? (
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
          data-source-label={manualDisplay ? "Manual" : snapView.sourceLabel}
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide border-border/50 bg-secondary/40"
        >
          {manualDisplay ? "Manual" : snapView.sourceLabel}
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

import { SENSOR_TRUTH_FUTURE_SKEW_MS } from "@/constants/sensorTruthRanges";
import { resolveCurrentStateStaleWindowMs } from "@/lib/sensorTruthCanon";
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";
import {
  classifyTimelineSensorSource,
  type TimelineSensorSourceBadge,
} from "@/lib/timelineSensorSourceBadgeRules";
import { buildTimelineSensorSnapshotViewModel } from "@/lib/timelineSensorSnapshotViewModel";
import { timelineManualSnapshotHistoryNotice } from "@/lib/timelineManualSensorMeasurementRules";
import { resolveTimelineDiaryEntryStage } from "@/lib/growDiaryTimelineRules";
import { classifyVpdAgainstStage } from "@/lib/vpdStageTargetRules";

type TimelineInlineSnapshotSensor = Record<string, unknown>;

export interface TimelineInlineSnapshotEntry {
  details?: Record<string, unknown> | null;
  entry_at?: string | null;
  stage?: string | null;
}

export interface TimelineInlineSnapshotViewModel {
  capturedAt: string | null;
  recheckAtMs: number | null;
  changesAtMs: number | null;
  sourceBadge: TimelineSensorSourceBadge;
  historyNotice: string | null;
  validationState: "invalid" | "warning" | null;
  chips: string[];
  hasFutureTimestamp: boolean;
  vpdStageHint: string | null;
}

function readObject(value: unknown): TimelineInlineSnapshotSensor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as TimelineInlineSnapshotSensor;
}

function readNonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildChipDisplay(metric: string, value: number, display: string): string {
  if (metric === "rh") return `${value}% RH`;
  if (metric === "ph") return `pH ${value}`;
  if (metric === "ec") return `EC ${value} mS/cm`;
  if (metric === "vpd") return `VPD ${value}`;
  if (metric === "co2") return `CO₂ ${value}`;
  if (metric === "soil_moisture") return `Soil ${value}%`;
  return display;
}

function resolveHistoryNotice(input: {
  sourceKind: string;
  capturedAt: string | null;
  nowMs: number;
  staleMs: number;
}): string | null {
  const notice = timelineManualSnapshotHistoryNotice(input);
  if (notice) return notice;
  const timestamp = classifySnapshotTimestamp(input.capturedAt, input.nowMs);
  if (timestamp === "missing" || timestamp === "unparseable") {
    return timelineManualSnapshotHistoryNotice({
      ...input,
      sourceKind: "manual",
    });
  }
  return null;
}

export function buildTimelineInlineSnapshotViewModel(
  entry: TimelineInlineSnapshotEntry,
  options: { nowMs?: number } = {},
): TimelineInlineSnapshotViewModel | null {
  const details = readObject(entry.details);
  const canonicalSensor = readObject(details?.sensor_snapshot);
  const legacySensor = readObject(details?.sensor);
  const manualCompatSensor = readObject(details?.manual_sensor_snapshot);
  const sensor = canonicalSensor ?? legacySensor ?? manualCompatSensor;
  if (!sensor) return null;

  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const rawSource =
    readNonBlankString(sensor.source) ?? readNonBlankString(details?.source) ?? null;
  const sourceKindForWindow = classifyTimelineSensorSource({
    rawSource,
    fallback: "manual",
    context: "persisted_snapshot",
  }).kind;
  const snapshotStaleMs = resolveCurrentStateStaleWindowMs(sourceKindForWindow);
  const capturedAt = readNonBlankString(sensor.ts) ?? readNonBlankString(sensor.captured_at);
  const capturedAtMs = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const usesManualCompatSensor =
    canonicalSensor == null && legacySensor == null && manualCompatSensor != null;
  const sourceBadge = classifyTimelineSensorSource({
    rawSource,
    capturedAt,
    now: nowMs,
    staleMs: snapshotStaleMs,
    context: "persisted_snapshot",
  });
  const historyNotice = resolveHistoryNotice({
    sourceKind: sourceBadge.kind,
    capturedAt,
    nowMs,
    staleMs: snapshotStaleMs,
  });
  const sensorViewModel = usesManualCompatSensor
    ? buildTimelineSensorSnapshotViewModel(sensor, {
        preferUnit: "F",
        validateManualCompatibility: true,
      })
    : null;
  const hasFutureTimestamp = classifySnapshotTimestamp(capturedAt, nowMs) === "future";
  const snapAgeMs = capturedAt ? nowMs - capturedAtMs : Number.POSITIVE_INFINITY;
  const snapStale = !Number.isFinite(snapAgeMs) || snapAgeMs > snapshotStaleMs;
  const rawVpd = typeof sensor.vpd === "number" && Number.isFinite(sensor.vpd) ? sensor.vpd : null;
  const vpdStageHint =
    rawVpd != null && sourceBadge.canAssessStage && !hasFutureTimestamp
      ? classifyVpdAgainstStage({
          value: rawVpd,
          stage: resolveTimelineDiaryEntryStage({
            stage: entry.stage ?? null,
            details: details ?? {},
          }),
          stale: snapStale,
        }).label
      : null;

  const chips =
    sensorViewModel?.kind === "chips"
      ? sensorViewModel.chips.map((chip) => buildChipDisplay(chip.metric, chip.value, chip.display))
      : [];
  if (!usesManualCompatSensor) {
    if (typeof sensor.temp === "number" && Number.isFinite(sensor.temp)) {
      chips.push(`${((sensor.temp * 9) / 5 + 32).toFixed(1)}°F`);
    }
    if (typeof sensor.rh === "number" && Number.isFinite(sensor.rh)) {
      chips.push(`${sensor.rh}% RH`);
    }
    if (typeof sensor.vpd === "number" && Number.isFinite(sensor.vpd)) {
      chips.push(`VPD ${sensor.vpd}`);
    }
    if (typeof sensor.co2 === "number" && Number.isFinite(sensor.co2)) {
      chips.push(`CO₂ ${sensor.co2}`);
    }
    if (typeof sensor.soil === "number" && Number.isFinite(sensor.soil)) {
      chips.push(`Soil ${sensor.soil}%`);
    }
  }

  const validationState =
    sensorViewModel?.kind === "invalid" ||
    (sensorViewModel?.kind === "chips" && sensorViewModel.errors.length > 0)
      ? "invalid"
      : sensorViewModel?.kind === "chips" && sensorViewModel.warnings.length > 0
        ? "warning"
        : null;

  return {
    capturedAt,
    recheckAtMs: Number.isFinite(capturedAtMs) ? capturedAtMs - SENSOR_TRUTH_FUTURE_SKEW_MS : null,
    changesAtMs: Number.isFinite(capturedAtMs) ? capturedAtMs + snapshotStaleMs : null,
    sourceBadge,
    historyNotice,
    validationState,
    chips,
    hasFutureTimestamp,
    vpdStageHint,
  };
}

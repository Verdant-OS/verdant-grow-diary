import { AI_DOCTOR_CONTEXT_READINESS_CONFIG } from "@/constants/aiDoctorContextReadiness";
import { SOIL_MOISTURE_STUCK_VALUES } from "@/constants/sensorTruthRanges";
import type { AiDoctorContextManualSnapshotInput } from "@/lib/aiDoctorContextRules";
import {
  MANUAL_CORRECTION_METRICS,
  type ManualCorrectionMetric,
} from "@/lib/manualSensorCorrectionContext";
import { isPpfdValid } from "@/lib/ppfdRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import { classifyManualMetric, isHumidityStuckExtreme } from "@/lib/sensorTruthRules";

export interface AiDoctorManualTentSensorRowLike {
  readonly tent_id?: unknown;
  readonly source?: unknown;
  readonly quality?: unknown;
  readonly captured_at?: unknown;
  readonly capturedAt?: unknown;
  readonly ts?: unknown;
  readonly metric?: unknown;
  readonly value?: unknown;
}

export interface AiDoctorManualTentSensorSnapshotAdapterOptions {
  readonly tentId: string;
  readonly now: number | Date;
  readonly existingSnapshots?: readonly AiDoctorContextManualSnapshotInput[];
}

interface ObservationGroup {
  readonly atMs: number;
  readonly atIso: string;
  hasPlausibleMetric: boolean;
  hasInvalidRecognizedMetric: boolean;
}

const RECOGNIZED_METRICS: ReadonlySet<string> = new Set(MANUAL_CORRECTION_METRICS);

function epochOf(value: AiDoctorContextManualSnapshotInput["at"]): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function nowEpoch(value: number | Date): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return Number.isFinite(value) ? value : null;
}

function recognizedMetric(value: unknown): ManualCorrectionMetric | null {
  if (typeof value !== "string" || !RECOGNIZED_METRICS.has(value)) return null;
  return value as ManualCorrectionMetric;
}

function isPlausibleMetric(metric: ManualCorrectionMetric, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (metric === "ppfd") return isPpfdValid(value);
  if (!classifyManualMetric(metric, value).valid) return false;
  if (metric === "humidity_pct" && isHumidityStuckExtreme(value)) return false;
  if (
    metric === "soil_moisture_pct" &&
    (SOIL_MOISTURE_STUCK_VALUES as readonly number[]).includes(value)
  ) {
    return false;
  }
  return true;
}

export function manualTentSensorRowsToAiDoctorContextSnapshots(
  rows: readonly AiDoctorManualTentSensorRowLike[] | null | undefined,
  options: AiDoctorManualTentSensorSnapshotAdapterOptions,
): AiDoctorContextManualSnapshotInput[] {
  const now = nowEpoch(options.now);
  if (now === null || typeof options.tentId !== "string" || options.tentId.trim().length === 0) {
    return [];
  }

  const existingTimes = new Set<number>();
  for (const snapshot of options.existingSnapshots ?? []) {
    const atMs = epochOf(snapshot?.at);
    if (atMs !== null) existingTimes.add(atMs);
  }

  const groups = new Map<number, ObservationGroup>();
  for (const row of rows ?? []) {
    if (!row || row.tent_id !== options.tentId || row.source !== "manual" || row.quality !== "ok") {
      continue;
    }

    const metric = recognizedMetric(row.metric);
    if (!metric) continue;

    const rawTime = resolveSensorObservationTime(row);
    if (rawTime === null) continue;
    const atMs = Date.parse(rawTime);
    if (!Number.isFinite(atMs)) continue;
    const ageMs = now - atMs;
    if (ageMs < 0 || ageMs > AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs) continue;

    let group = groups.get(atMs);
    if (!group) {
      group = {
        atMs,
        atIso: new Date(atMs).toISOString(),
        hasPlausibleMetric: false,
        hasInvalidRecognizedMetric: false,
      };
      groups.set(atMs, group);
    }

    if (isPlausibleMetric(metric, row.value)) {
      group.hasPlausibleMetric = true;
    } else {
      group.hasInvalidRecognizedMetric = true;
    }
  }

  return [...groups.values()]
    .filter(
      (group) =>
        group.hasPlausibleMetric &&
        !group.hasInvalidRecognizedMetric &&
        !existingTimes.has(group.atMs),
    )
    .sort((a, b) => b.atMs - a.atMs || a.atIso.localeCompare(b.atIso))
    .map((group) => ({ at: group.atIso, severity: "ok" }));
}

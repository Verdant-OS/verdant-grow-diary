/**
 * aiDoctorCurrentSensorSnapshotRules — pure, bounded projection of recent
 * tent sensor rows into one source-preserving AI Doctor snapshot.
 *
 * The packet builder needs current values from the same `sensor_readings`
 * table used by manual entry and bridge ingest. This helper keeps that read
 * safe before anything reaches a model:
 *  - only canonical `live` or `manual` rows are eligible;
 *  - rows from different sources are never combined;
 *  - only values close to the newest eligible row are grouped together;
 *  - invalid values are omitted and called out, never treated as healthy;
 *  - raw payloads, device ids, row ids, and private metadata never leave.
 *
 * Pure: no React, Supabase, I/O, model calls, alerts, Action Queue, or device
 * control.
 */
import {
  buildAiSensorSnapshotContext,
  type AiSensorSnapshotSource,
  type AiSensorSnapshotTrust,
} from "@/lib/aiSensorSnapshotContextRules";
import {
  classifyFreshness,
  evaluateMetric,
  SENSOR_FRESH_WINDOW_MINUTES,
  type SensorMetricKey,
} from "@/lib/latestSensorSnapshotRules";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";
import { evaluateCurrentLiveSensorTruth } from "@/lib/currentLiveSensorTruthRules";
import {
  classificationFromStatusResult,
  type Classification,
  type SensorSnapshotStatusResult,
} from "@/lib/sensorSnapshotStatusContract";

export const AI_DOCTOR_CURRENT_SENSOR_SOURCES = ["live", "manual"] as const;
export const AI_DOCTOR_CURRENT_SENSOR_ROW_CAP = 50;
/** Allow asynchronously reported tent sensors to form one current snapshot. */
export const AI_DOCTOR_CURRENT_SENSOR_COHERENCE_MS = 5 * 60 * 1000;

export type AiDoctorCurrentSensorSource = (typeof AI_DOCTOR_CURRENT_SENSOR_SOURCES)[number];

export interface AiDoctorCurrentSensorRowLike {
  source?: unknown;
  metric?: unknown;
  value?: unknown;
  captured_at?: unknown;
  ts?: unknown;
  created_at?: unknown;
  id?: unknown;
  raw_payload?: unknown;
  [key: string]: unknown;
}

export interface AiDoctorCurrentSensorReading {
  field: string;
  value: number;
  unit: string;
}

export interface AiDoctorCurrentSensorAnnotation {
  line: string;
  source: AiSensorSnapshotSource;
  stale: boolean;
  trust: AiSensorSnapshotTrust;
  includesValues: boolean;
  safetyNotes: string[];
  missingInformationHints: string[];
}

export interface AiDoctorCurrentSensorSnapshot {
  capturedAt: string;
  severity: "ok" | "warning" | "invalid";
  readings: AiDoctorCurrentSensorReading[];
  annotation: AiDoctorCurrentSensorAnnotation;
}

interface MetricProjection {
  packetField: string;
  annotationField: string;
  unit: string;
  evaluateAs: SensorMetricKey;
  evaluationValue: number;
}

interface Candidate {
  source: AiDoctorCurrentSensorSource;
  quality: unknown;
  metric: string;
  value: number;
  atMs: number;
  atIso: string;
  stableKey: string;
}

function normalizeSource(value: unknown): AiDoctorCurrentSensorSource | null {
  if (typeof value !== "string") return null;
  const source = value.trim().toLowerCase();
  return source === "live" || source === "manual" ? source : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function timestampOf(row: AiDoctorCurrentSensorRowLike): { ms: number; iso: string } | null {
  const raw = row.captured_at ?? row.ts ?? row.created_at;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return { ms, iso: new Date(ms).toISOString() };
}

function projectMetric(metric: string, value: number): MetricProjection | null {
  switch (metric) {
    case "temperature_c":
      return {
        packetField: "temperature_c",
        annotationField: "temperature_c",
        unit: "°C",
        evaluateAs: "temp_f",
        evaluationValue: (value * 9) / 5 + 32,
      };
    case "temp_f":
    case "temperature_f":
      return {
        packetField: "temperature_f",
        annotationField: "temperature_f",
        unit: "°F",
        evaluateAs: "temp_f",
        evaluationValue: value,
      };
    case "humidity":
    case "humidity_pct":
      return {
        packetField: "humidity_pct",
        annotationField: "humidity",
        unit: "%",
        evaluateAs: "humidity_pct",
        evaluationValue: value,
      };
    case "vpd":
    case "vpd_kpa":
      return {
        packetField: "vpd_kpa",
        annotationField: "vpd_kpa",
        unit: "kPa",
        evaluateAs: "vpd_kpa",
        evaluationValue: value,
      };
    case "soil_moisture":
    case "soil_moisture_pct":
      return {
        packetField: "soil_moisture_pct",
        annotationField: "soil_moisture",
        unit: "%",
        evaluateAs: "soil_moisture_pct",
        evaluationValue: value,
      };
    case "co2":
    case "co2_ppm":
      return {
        packetField: "co2_ppm",
        annotationField: "co2_ppm",
        unit: "ppm",
        evaluateAs: "co2_ppm",
        evaluationValue: value,
      };
    default:
      return null;
  }
}

function toCandidate(row: AiDoctorCurrentSensorRowLike): Candidate | null {
  // Diagnostic packets may be stored with canonical source=live after a
  // successful transport test. They are never plant evidence and must not
  // reach a model as current sensor truth.
  if (isSensorTestbenchRow(row)) return null;
  const source = normalizeSource(row.source);
  const metric = typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
  const value = finiteNumber(row.value);
  const at = timestampOf(row);
  if (!source || !metric || value === null || !at) return null;
  if (!projectMetric(metric, value)) return null;
  const id = typeof row.id === "string" ? row.id : "";
  const created = typeof row.created_at === "string" ? row.created_at : "";
  return {
    source,
    quality: row.quality,
    metric,
    value,
    atMs: at.ms,
    atIso: at.iso,
    stableKey: `${metric}\u0000${String(value)}\u0000${created}\u0000${id}`,
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.atMs !== b.atMs) return b.atMs - a.atMs;
  if (a.source !== b.source) return a.source === "live" ? -1 : 1;
  return a.stableKey.localeCompare(b.stableKey);
}

function appendUnique(values: readonly string[], addition: string | null): string[] {
  return Array.from(new Set(addition ? [...values, addition] : values)).sort();
}

/**
 * Select the newest bounded live/manual sensor cohort and project only safe,
 * source-preserving values into the AI Doctor packet shape.
 */
export function buildAiDoctorCurrentSensorSnapshot(
  rows: readonly AiDoctorCurrentSensorRowLike[] | null | undefined,
  options: { now?: Date } = {},
): AiDoctorCurrentSensorSnapshot | null {
  const candidates = (rows ?? []).map(toCandidate).filter((row): row is Candidate => row !== null);
  if (candidates.length === 0) return null;
  candidates.sort(compareCandidates);

  const newest = candidates[0];
  const cohort = candidates.filter(
    (row) =>
      row.source === newest.source &&
      newest.atMs - row.atMs <= AI_DOCTOR_CURRENT_SENSOR_COHERENCE_MS,
  );

  // First row wins for each normalized packet field because the cohort is
  // already sorted newest-first with deterministic tie-breakers.
  const seenFields = new Set<string>();
  const readings: AiDoctorCurrentSensorReading[] = [];
  const annotationInput: Record<string, unknown> = {
    source: newest.source,
    captured_at: newest.atIso,
  };
  let invalidCount = 0;
  let warningCount = 0;

  for (const row of cohort) {
    const projection = projectMetric(row.metric, row.value);
    if (!projection || seenFields.has(projection.packetField)) continue;
    seenFields.add(projection.packetField);
    const evaluation = evaluateMetric(projection.evaluateAs, projection.evaluationValue);
    if (!evaluation.valid) {
      invalidCount += 1;
      continue;
    }
    if (evaluation.warn) warningCount += 1;
    readings.push({
      field: projection.packetField,
      value: row.value,
      unit: projection.unit,
    });
    annotationInput[projection.annotationField] = row.value;
  }

  readings.sort((a, b) => a.field.localeCompare(b.field));

  const now = options.now ?? new Date();
  const freshness = classifyFreshness(newest.atIso, now);
  const qualityOk = cohort.every((row) => row.quality === "ok");
  annotationInput.quality = qualityOk ? "ok" : null;
  const invalidSnapshot =
    freshness.freshness === "invalid" ||
    readings.length === 0 ||
    !qualityOk ||
    invalidCount > 0 ||
    warningCount > 0;
  if (invalidSnapshot) annotationInput.source = "invalid";

  const context = buildAiSensorSnapshotContext(annotationInput, {
    now,
    staleThresholdMs: SENSOR_FRESH_WINDOW_MINUTES * 60 * 1000,
  });
  const invalidNote =
    invalidCount > 0
      ? "One or more current sensor values were omitted because they failed plausibility validation."
      : null;
  const warningNote =
    warningCount > 0
      ? "One or more current sensor values are near caution thresholds; interpret them conservatively."
      : null;
  const qualityNote = !qualityOk
    ? "Current sensor rows were omitted because every contributing row must be quality=ok."
    : null;
  const trust = invalidCount > 0 && context.trustLevel === "high" ? "medium" : context.trustLevel;
  const annotationLine =
    trust === context.trustLevel
      ? context.annotationLine
      : context.annotationLine.replace("trust=high", "trust=medium");

  return {
    capturedAt: newest.atIso,
    severity: invalidSnapshot
      ? "invalid"
      : invalidCount > 0 || warningCount > 0 || context.stale
        ? "warning"
        : "ok",
    readings: invalidSnapshot ? [] : readings,
    annotation: {
      line: annotationLine,
      source: context.sourceLabel,
      stale: context.stale,
      trust,
      includesValues: context.valuesForModel !== null,
      safetyNotes: appendUnique(
        appendUnique(appendUnique(context.safetyNotes, invalidNote), warningNote),
        qualityNote,
      ),
      missingInformationHints: [...context.missingInformationHints].sort(),
    },
  };
}

/**
 * Convert the provenance-filtered current-row projection into the shared
 * Sensor Snapshot Status Contract used by AI Doctor readiness and audit
 * persistence. Transport success alone is intentionally insufficient.
 */
export function classifyAiDoctorCurrentSensorEvidence(
  rows: readonly AiDoctorCurrentSensorRowLike[] | null | undefined,
  options: { now?: Date } = {},
): Classification {
  const snapshot = buildAiDoctorCurrentSensorSnapshot(rows, options);
  let result: SensorSnapshotStatusResult;
  if (!snapshot) {
    result = { status: "no_data", reasonCode: "none_received" };
  } else if (snapshot.severity === "invalid" || snapshot.annotation.source === "invalid") {
    result = { status: "invalid", reasonCode: "malformed_payload" };
  } else if (snapshot.annotation.stale) {
    result = { status: "stale", reasonCode: "stale_timestamp" };
  } else if (snapshot.annotation.source !== "live") {
    // Manual evidence stays useful context but never becomes healthy live
    // bridge evidence for the readiness score.
    result = { status: "needs_review", reasonCode: "none_accepted" };
  } else if (currentLiveTruthFromSnapshot(snapshot, options.now ?? new Date()).isCurrentLive) {
    result = { status: "usable", reasonCode: "fresh_accept" };
  } else {
    result = { status: "needs_review", reasonCode: "none_accepted" };
  }
  return classificationFromStatusResult(result);
}

function currentLiveTruthFromSnapshot(snapshot: AiDoctorCurrentSensorSnapshot, now: Date) {
  return evaluateCurrentLiveSensorTruth({
    source: snapshot.annotation.source,
    quality: snapshot.severity === "ok" ? "ok" : null,
    freshness: classifyFreshness(snapshot.capturedAt, now).freshness,
  });
}

/**
 * Prefer row-level evidence whenever present. A coarse bridge-audit fallback
 * may explain stale/invalid/no-data states, but it cannot grant `usable`
 * because audit counts do not carry vendor/test-confidence provenance.
 */
export function selectAiDoctorSensorEvidenceClassification(
  current: Classification,
  auditFallback: Classification | null | undefined,
): Classification {
  if (current.status !== "no_data") return current;
  if (auditFallback && auditFallback.status !== "usable") return auditFallback;
  return current;
}

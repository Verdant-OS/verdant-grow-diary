/**
 * aiDoctorReviewRequestPacketValidationRules — strict, pure validation at the
 * untrusted request boundary for the server-side AI Doctor review packet.
 *
 * The browser packet builder remains the source of normal application input.
 * This module independently reconstructs that known schema so unknown keys,
 * prototype keys, oversized values, and malformed nested summaries cannot
 * enter prompt assembly or consume an AI credit.
 */

import type {
  AiDoctorReviewRequestEvent,
  AiDoctorReviewRequestPacket,
  AiDoctorReviewRequestSnapshot,
  AiDoctorReviewRequestSnapshotAnnotation,
} from "./aiDoctorReviewRequestPacket";
import {
  AI_DOCTOR_CSV_HISTORY_LABEL,
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
} from "../constants/aiDoctorImportedHistory";

export const AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH = 512;
export const AI_DOCTOR_REVIEW_PACKET_MAX_ANNOTATION_LENGTH = 1_024;
export const AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS = 32;
export const AI_DOCTOR_REVIEW_PACKET_MAX_SNAPSHOT_READINGS = 32;
export const AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS = 64;
export const AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_READINGS = 200;
export const AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER = 1_000_000_000;

const SCHEMA_VERSION = 1 as const;
const EVENT_CAP = 20;
const NOTE_CAP = 12;
const SOURCE_APP_MAX_LENGTH = 80;
const VENDOR_LABEL_MAX_LENGTH = 120;
const METRIC_MAX_LENGTH = 80;
const UNIT_MAX_LENGTH = 32;
const TIMESTAMP_MAX_LENGTH = 64;

const READINESS_STATES = ["strong", "partial", "insufficient"] as const;
const EVENT_CATEGORIES = [
  "notes",
  "watering",
  "feeding",
  "photos",
  "manual_sensor_snapshot",
  "warnings",
  "other",
] as const;
const SNAPSHOT_SEVERITIES = ["ok", "warning", "invalid"] as const;
const SNAPSHOT_SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid", "unknown"] as const;
const SNAPSHOT_TRUST_LEVELS = ["low", "medium", "high"] as const;

type Normalization<T> = { ok: true; value: T } | { ok: false };

const INVALID: { ok: false } = Object.freeze({ ok: false });

function valid<T>(value: T): Normalization<T> {
  return { ok: true, value };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOwnKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => hasOwn(value, key));
}

function isOneOf<const T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function normalizeString(value: unknown, maxLength: number): Normalization<string> {
  if (typeof value !== "string") return INVALID;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) return INVALID;
  return valid(normalized);
}

function normalizeNullableString(value: unknown, maxLength: number): Normalization<string | null> {
  if (value === null) return valid(null);
  return normalizeString(value, maxLength);
}

function normalizeTimestamp(value: unknown): Normalization<string> {
  const normalized = normalizeString(value, TIMESTAMP_MAX_LENGTH);
  if (!normalized.ok || !Number.isFinite(Date.parse(normalized.value))) return INVALID;
  return normalized;
}

function normalizeStringArray(
  value: unknown,
  maxItems: number,
  maxStringLength = AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
): Normalization<string[]> {
  if (!Array.isArray(value) || value.length > maxItems) return INVALID;
  const normalized: string[] = [];
  for (const item of value) {
    const result = normalizeString(item, maxStringLength);
    if (!result.ok) return INVALID;
    normalized.push(result.value);
  }
  return valid(normalized);
}

function normalizeFiniteNumber(value: unknown): Normalization<number> {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER
  ) {
    return INVALID;
  }
  return valid(value === 0 ? 0 : value);
}

function normalizeCount(value: unknown, max: number, min = 0): Normalization<number> {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    return INVALID;
  }
  return valid(value as number);
}

function normalizeEvents(value: unknown): Normalization<AiDoctorReviewRequestEvent[]> {
  if (!Array.isArray(value) || value.length > EVENT_CAP) return INVALID;
  const events: AiDoctorReviewRequestEvent[] = [];
  for (const item of value) {
    const record = isPlainRecord(item) ? item : null;
    if (!record || !hasOwnKeys(record, ["at", "category"])) return INVALID;
    const at = normalizeTimestamp(record.at);
    if (!at.ok || !isOneOf(record.category, EVENT_CATEGORIES)) return INVALID;
    events.push({ at: at.value, category: record.category });
  }
  return valid(events);
}

function normalizeSnapshot(value: unknown): Normalization<AiDoctorReviewRequestSnapshot | null> {
  if (value === null) return valid(null);
  const record = isPlainRecord(value) ? value : null;
  if (!record || !hasOwnKeys(record, ["capturedAt", "severity", "readings"])) {
    return INVALID;
  }
  const capturedAt = normalizeTimestamp(record.capturedAt);
  if (!capturedAt.ok || !isOneOf(record.severity, SNAPSHOT_SEVERITIES)) return INVALID;
  if (
    !Array.isArray(record.readings) ||
    record.readings.length > AI_DOCTOR_REVIEW_PACKET_MAX_SNAPSHOT_READINGS
  ) {
    return INVALID;
  }

  const readings: AiDoctorReviewRequestSnapshot["readings"] = [];
  for (const item of record.readings) {
    const reading = isPlainRecord(item) ? item : null;
    if (!reading || !hasOwnKeys(reading, ["field", "value", "unit"])) return INVALID;
    const field = normalizeString(reading.field, METRIC_MAX_LENGTH);
    const numericValue = normalizeFiniteNumber(reading.value);
    const unit = normalizeString(reading.unit, UNIT_MAX_LENGTH);
    if (!field.ok || !numericValue.ok || !unit.ok) return INVALID;
    readings.push({ field: field.value, value: numericValue.value, unit: unit.value });
  }

  return valid({
    capturedAt: capturedAt.value,
    severity: record.severity,
    readings,
  });
}

function normalizeSnapshotAnnotation(
  value: unknown,
): Normalization<AiDoctorReviewRequestSnapshotAnnotation | null> {
  if (value === null) return valid(null);
  const record = isPlainRecord(value) ? value : null;
  if (
    !record ||
    !hasOwnKeys(record, [
      "line",
      "source",
      "stale",
      "trust",
      "includesValues",
      "safetyNotes",
      "missingInformationHints",
    ])
  ) {
    return INVALID;
  }

  const line = normalizeString(record.line, AI_DOCTOR_REVIEW_PACKET_MAX_ANNOTATION_LENGTH);
  const safetyNotes = normalizeStringArray(record.safetyNotes, NOTE_CAP);
  const missingInformationHints = normalizeStringArray(record.missingInformationHints, NOTE_CAP);
  if (
    !line.ok ||
    !isOneOf(record.source, SNAPSHOT_SOURCES) ||
    typeof record.stale !== "boolean" ||
    !isOneOf(record.trust, SNAPSHOT_TRUST_LEVELS) ||
    typeof record.includesValues !== "boolean" ||
    !safetyNotes.ok ||
    !missingInformationHints.ok
  ) {
    return INVALID;
  }

  return valid({
    line: line.value,
    source: record.source,
    stale: record.stale,
    trust: record.trust,
    includesValues: record.includesValues,
    safetyNotes: safetyNotes.value,
    missingInformationHints: missingInformationHints.value,
  });
}

function matchesCanonicalGuidance(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE.length &&
    value.every((item, index) => item === AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE[index])
  );
}

function normalizeImportedHistory(
  value: unknown,
): Normalization<NonNullable<AiDoctorReviewRequestPacket["imported_sensor_history"]> | null> {
  if (value === null) return valid(null);
  const record = isPlainRecord(value) ? value : null;
  if (
    !record ||
    !hasOwnKeys(record, [
      "hasCsvHistory",
      "historicalLabel",
      "notForLiveDiagnosis",
      "totalReadings",
      "dateRange",
      "vendors",
      "metrics",
      "excludedQualityCount",
      "suspiciousFlagCount",
      "sectionLabel",
      "guidance",
    ]) ||
    record.hasCsvHistory !== true ||
    record.historicalLabel !== AI_DOCTOR_CSV_HISTORY_LABEL ||
    record.notForLiveDiagnosis !== AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE ||
    record.sectionLabel !== AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL ||
    !matchesCanonicalGuidance(record.guidance)
  ) {
    return INVALID;
  }

  const totalReadings = normalizeCount(
    record.totalReadings,
    AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_READINGS,
    1,
  );
  if (!totalReadings.ok) return INVALID;
  const excludedQualityCount = normalizeCount(record.excludedQualityCount, totalReadings.value);
  const suspiciousFlagCount = normalizeCount(record.suspiciousFlagCount, totalReadings.value);
  if (!excludedQualityCount.ok || !suspiciousFlagCount.ok) return INVALID;

  let dateRange: { earliest: string; latest: string } | null = null;
  if (record.dateRange !== null) {
    const range = isPlainRecord(record.dateRange) ? record.dateRange : null;
    if (!range || !hasOwnKeys(range, ["earliest", "latest"])) return INVALID;
    const earliest = normalizeTimestamp(range.earliest);
    const latest = normalizeTimestamp(range.latest);
    if (!earliest.ok || !latest.ok || Date.parse(earliest.value) > Date.parse(latest.value)) {
      return INVALID;
    }
    dateRange = { earliest: earliest.value, latest: latest.value };
  }

  if (
    !Array.isArray(record.vendors) ||
    record.vendors.length > AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS
  ) {
    return INVALID;
  }
  const vendors: NonNullable<
    AiDoctorReviewRequestPacket["imported_sensor_history"]
  >["vendors"][number][] = [];
  for (const item of record.vendors) {
    const vendor = isPlainRecord(item) ? item : null;
    if (!vendor || !hasOwnKeys(vendor, ["sourceApp", "vendorLabel", "count"])) {
      return INVALID;
    }
    const sourceApp = normalizeString(vendor.sourceApp, SOURCE_APP_MAX_LENGTH);
    const vendorLabel = normalizeString(vendor.vendorLabel, VENDOR_LABEL_MAX_LENGTH);
    const count = normalizeCount(vendor.count, totalReadings.value, 1);
    if (!sourceApp.ok || !vendorLabel.ok || !count.ok) return INVALID;
    vendors.push({
      sourceApp: sourceApp.value,
      vendorLabel: vendorLabel.value,
      count: count.value,
    });
  }

  if (
    !Array.isArray(record.metrics) ||
    record.metrics.length > AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS
  ) {
    return INVALID;
  }
  const metrics: NonNullable<
    AiDoctorReviewRequestPacket["imported_sensor_history"]
  >["metrics"][number][] = [];
  for (const item of record.metrics) {
    const metric = isPlainRecord(item) ? item : null;
    if (!metric || !hasOwnKeys(metric, ["metric", "unit", "count", "min", "max", "avg"])) {
      return INVALID;
    }
    const metricName = normalizeString(metric.metric, METRIC_MAX_LENGTH);
    const unit = normalizeNullableString(metric.unit, UNIT_MAX_LENGTH);
    const count = normalizeCount(metric.count, totalReadings.value, 1);
    const min = normalizeFiniteNumber(metric.min);
    const max = normalizeFiniteNumber(metric.max);
    const avg = normalizeFiniteNumber(metric.avg);
    if (!metricName.ok || !unit.ok || !count.ok || !min.ok || !max.ok || !avg.ok) {
      return INVALID;
    }
    const epsilon = Math.max(1, Math.abs(min.value), Math.abs(max.value)) * 1e-9;
    if (
      min.value > max.value ||
      avg.value < min.value - epsilon ||
      avg.value > max.value + epsilon
    ) {
      return INVALID;
    }
    metrics.push({
      metric: metricName.value,
      unit: unit.value,
      count: count.value,
      min: min.value,
      max: max.value,
      avg: avg.value,
    });
  }

  return valid({
    hasCsvHistory: true,
    historicalLabel: AI_DOCTOR_CSV_HISTORY_LABEL,
    notForLiveDiagnosis: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
    totalReadings: totalReadings.value,
    dateRange,
    vendors,
    metrics,
    excludedQualityCount: excludedQualityCount.value,
    suspiciousFlagCount: suspiciousFlagCount.value,
    sectionLabel: AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
    guidance: [...AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE],
  });
}

/**
 * Validate and reconstruct the current AI Doctor packet schema.
 *
 * Returns null for malformed or over-budget input. The returned packet has a
 * fixed key set at every level and never inherits request-provided prototypes.
 */
export function validateAndNormalizeAiDoctorReviewRequestPacket(
  value: unknown,
): AiDoctorReviewRequestPacket | null {
  const record = isPlainRecord(value) ? value : null;
  if (
    !record ||
    !hasOwnKeys(record, [
      "schemaVersion",
      "plant",
      "readiness",
      "recentEvents",
      "recentSensorSnapshot",
    ]) ||
    record.schemaVersion !== SCHEMA_VERSION
  ) {
    return null;
  }

  const plant = isPlainRecord(record.plant) ? record.plant : null;
  if (!plant || !hasOwnKeys(plant, ["strain", "stage", "medium", "potSize"])) return null;
  const strain = normalizeNullableString(plant.strain, AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);
  const stage = normalizeNullableString(plant.stage, AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);
  const medium = normalizeNullableString(plant.medium, AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);
  const potSize = normalizeNullableString(plant.potSize, AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);
  if (!strain.ok || !stage.ok || !medium.ok || !potSize.ok) return null;

  const readiness = isPlainRecord(record.readiness) ? record.readiness : null;
  if (!readiness || !hasOwnKeys(readiness, ["state", "evidence", "missing"])) return null;
  const evidence = normalizeStringArray(readiness.evidence, AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS);
  const missing = normalizeStringArray(readiness.missing, AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS);
  if (!isOneOf(readiness.state, READINESS_STATES) || !evidence.ok || !missing.ok) return null;

  const recentEvents = normalizeEvents(record.recentEvents);
  const recentSensorSnapshot = normalizeSnapshot(record.recentSensorSnapshot);
  if (!recentEvents.ok || !recentSensorSnapshot.ok) return null;

  const packet: AiDoctorReviewRequestPacket = {
    schemaVersion: SCHEMA_VERSION,
    plant: {
      strain: strain.value,
      stage: stage.value,
      medium: medium.value,
      potSize: potSize.value,
    },
    readiness: {
      state: readiness.state,
      evidence: evidence.value,
      missing: missing.value,
    },
    recentEvents: recentEvents.value,
    recentSensorSnapshot: recentSensorSnapshot.value,
  };

  if (hasOwn(record, "recentSensorSnapshotAnnotation")) {
    const annotation = normalizeSnapshotAnnotation(record.recentSensorSnapshotAnnotation);
    if (!annotation.ok) return null;
    packet.recentSensorSnapshotAnnotation = annotation.value;
  }
  if (hasOwn(record, "imported_sensor_history")) {
    const importedHistory = normalizeImportedHistory(record.imported_sensor_history);
    if (!importedHistory.ok) return null;
    packet.imported_sensor_history = importedHistory.value;
  }
  if (hasOwn(record, "missingLiveSensorReadings")) {
    if (typeof record.missingLiveSensorReadings !== "boolean") return null;
    packet.missingLiveSensorReadings = record.missingLiveSensorReadings;
  }

  return packet;
}

/**
 * sensorReadingProvenanceDisplayRules — pure display helper for safe
 * sensor provenance summaries.
 *
 * This helper is intentionally read-only and schema-neutral. It never
 * returns raw_payload bodies, tokens, URLs, headers, or arbitrary fields.
 * It only exposes a small allow-list of display-safe provenance labels.
 */
import {
  isCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";

export interface SensorReadingProvenanceDisplayInput {
  source: unknown;
  capturedAt?: unknown;
  rawPayload?: unknown;
}

export interface SensorReadingProvenanceDisplayModel {
  source: CanonicalSensorSource;
  sourceLabel: string;
  sourceAppLabel: string | null;
  transportLabel: string | null;
  vendorLabel: string | null;
  bridgeLabel: string | null;
  capturedAt: string | null;
  isDisplaySafe: true;
}

const SOURCE_LABELS: Record<CanonicalSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

const SAFE_RAW_KEYS = new Set([
  "source_app",
  "transport",
  "vendor",
  "bridge",
]);

const BLOCKED_VALUE_PATTERN =
  /service_role|authorization|bearer\s+|passkey|api[_-]?key|secret|token|jwt|eyJ/i;

function readRawObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (BLOCKED_VALUE_PATTERN.test(trimmed)) return null;
  return trimmed.slice(0, 80);
}

function readSafeRawLabel(
  raw: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!raw || !SAFE_RAW_KEYS.has(key)) return null;
  return cleanLabel(raw[key]);
}

function normalizeCapturedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const t = Date.parse(trimmed);
  return Number.isFinite(t) ? trimmed : null;
}

export function buildSensorReadingProvenanceDisplayModel(
  input: SensorReadingProvenanceDisplayInput,
): SensorReadingProvenanceDisplayModel | null {
  if (!isCanonicalSensorSource(input.source)) return null;
  const raw = readRawObject(input.rawPayload);

  return {
    source: input.source,
    sourceLabel: SOURCE_LABELS[input.source],
    sourceAppLabel: readSafeRawLabel(raw, "source_app"),
    transportLabel: readSafeRawLabel(raw, "transport"),
    vendorLabel: readSafeRawLabel(raw, "vendor"),
    bridgeLabel: readSafeRawLabel(raw, "bridge"),
    capturedAt: normalizeCapturedAt(input.capturedAt),
    isDisplaySafe: true,
  };
}

export const SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS = SAFE_RAW_KEYS;

/**
 * Pure normalization rules for external sensor ingest payloads.
 *
 * Transforms loosely-shaped external payloads (from a future Pi / Home
 * Assistant / MQTT / CSV ingest path) into validated rows compatible with
 * the existing `sensor_readings` batch insert helper.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks.
 *  - Only the metrics/sources the DB trigger currently allows.
 *  - Never silently clamps timestamps or values.
 *  - Never includes `user_id` — RLS + DB default `auth.uid()` own ownership.
 *  - Raw payload is preserved verbatim into `raw_payload` ONLY. It is never
 *    consulted for snapshot/alert/Action Queue calculations.
 */

import type { TablesInsert } from "@/integrations/supabase/types";

export type AllowedMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct";

export type AllowedSource = "manual" | "pi_bridge" | "sim";

export type AllowedUnit =
  | "temperature_c"
  | "temperature_f"
  | "percent"
  | "kPa"
  | "ppm";

export const ALLOWED_METRICS: readonly AllowedMetric[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;

export const ALLOWED_SOURCES: readonly AllowedSource[] = [
  "manual",
  "pi_bridge",
  "sim",
] as const;

/**
 * Source persistence policy at the normalization layer.
 *
 * NOTE: This is a forward-looking policy helper for the future ingest path.
 * It declares that `sim` data must NOT contribute to persisted alerts. It
 * does NOT yet alter the live alert-persistence pipeline; that pipeline
 * currently keys off `snapshot.source` ("live" | "manual" | "diary" |
 * "unavailable") and treats any non-"manual" sensor reading as "live",
 * which means `sim` rows could currently flow through. Wiring this helper
 * into the snapshot/persistence pipeline is the next recommended safety
 * cleanup.
 */
export function isSensorSourcePersistable(source: string): boolean {
  return source === "manual" || source === "pi_bridge";
}

export interface ExternalSensorReadingInput {
  metric: string;
  value: unknown;
  unit: string;
  quality?: string | null;
}

export interface ExternalSensorIngestPayload {
  tent_id?: string | null;
  device_id?: string | null;
  captured_at?: string | null;
  source: string;
  readings?: ExternalSensorReadingInput | ExternalSensorReadingInput[];
  raw_payload?: unknown;
}

export type NormalizedSensorReadingDraft = TablesInsert<"sensor_readings">;

export interface SensorIngestNormalizationResult {
  ok: boolean;
  rows: NormalizedSensorReadingDraft[];
  errors: string[];
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function isAllowedMetric(m: string): m is AllowedMetric {
  return (ALLOWED_METRICS as readonly string[]).includes(m);
}
function isAllowedSource(s: string): s is AllowedSource {
  return (ALLOWED_SOURCES as readonly string[]).includes(s);
}

function convertUnit(
  metric: AllowedMetric,
  value: number,
  unit: string,
): { ok: true; value: number } | { ok: false; error: string } {
  switch (metric) {
    case "temperature_c":
      if (unit === "temperature_c") return { ok: true, value };
      if (unit === "temperature_f")
        return { ok: true, value: (value - 32) * (5 / 9) };
      return { ok: false, error: `unknown unit for temperature_c: ${unit}` };
    case "humidity_pct":
      if (unit === "percent") return { ok: true, value };
      return { ok: false, error: `unknown unit for humidity_pct: ${unit}` };
    case "vpd_kpa":
      if (unit === "kPa") return { ok: true, value };
      return { ok: false, error: `unknown unit for vpd_kpa: ${unit}` };
    case "co2_ppm":
      if (unit === "ppm") return { ok: true, value };
      return { ok: false, error: `unknown unit for co2_ppm: ${unit}` };
    case "soil_moisture_pct":
      if (unit === "percent") return { ok: true, value };
      return {
        ok: false,
        error: `unknown unit for soil_moisture_pct: ${unit}`,
      };
  }
}

export function normalizeIngestPayload(
  input: ExternalSensorIngestPayload,
  opts: { now?: Date } = {},
): SensorIngestNormalizationResult {
  const errors: string[] = [];
  const rows: NormalizedSensorReadingDraft[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, rows: [], errors: ["payload required"] };
  }

  if (!input.tent_id) errors.push("tent_id required");
  if (!input.source) errors.push("source required");
  else if (!isAllowedSource(input.source))
    errors.push(`invalid source: ${input.source}`);

  let capturedAt: string | null = null;
  if (input.captured_at !== undefined && input.captured_at !== null) {
    const t = Date.parse(input.captured_at);
    if (!Number.isFinite(t)) {
      errors.push(`invalid captured_at: ${input.captured_at}`);
    } else {
      const now = (opts.now ?? new Date()).getTime();
      if (t > now + FUTURE_TOLERANCE_MS) {
        errors.push(
          `captured_at more than 5 minutes in the future: ${input.captured_at}`,
        );
      } else {
        capturedAt = new Date(t).toISOString();
      }
    }
  }

  const readingsList = input.readings
    ? Array.isArray(input.readings)
      ? input.readings
      : [input.readings]
    : [];

  if (readingsList.length === 0) errors.push("at least one reading required");

  if (errors.length > 0) return { ok: false, rows: [], errors };

  readingsList.forEach((r, idx) => {
    if (!r || typeof r !== "object") {
      errors.push(`reading ${idx}: invalid`);
      return;
    }
    if (!isAllowedMetric(r.metric)) {
      errors.push(`reading ${idx}: invalid metric: ${r.metric}`);
      return;
    }
    const numeric = typeof r.value === "number" ? r.value : Number(r.value);
    if (!Number.isFinite(numeric)) {
      errors.push(`reading ${idx}: non-finite value`);
      return;
    }
    const conv = convertUnit(r.metric, numeric, r.unit);
    if (conv.ok !== true) {
      errors.push(`reading ${idx}: ${conv.error}`);
      return;
    }
    const tsIso = capturedAt ?? (opts.now ?? new Date()).toISOString();
    const row: NormalizedSensorReadingDraft = {
      tent_id: input.tent_id as string,
      metric: r.metric,
      value: conv.value,
      source: input.source as AllowedSource,
      ts: tsIso,
      quality: r.quality ?? "ok",
      device_id: input.device_id ?? null,
      captured_at: capturedAt,
      raw_payload:
        input.raw_payload === undefined
          ? null
          : (input.raw_payload as NormalizedSensorReadingDraft["raw_payload"]),
    };
    rows.push(row);
  });

  if (errors.length > 0) return { ok: false, rows: [], errors };
  return { ok: true, rows, errors: [] };
}

/**
 * piIngestRequestRules — pure request-envelope validator for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network.
 *  - Validates parsed JSON request bodies against the contract defined in
 *    `docs/pi-ingest-readings-contract.md`. Does not write anything.
 *  - Caller is responsible for feeding `toExternalSensorIngestPayload` output
 *    into the existing `normalizeIngestPayload` pipeline.
 *
 * The contract forbids:
 *  - sources other than `pi_bridge` (sim/manual rejected here)
 *  - metrics outside the V0 allowlist (no PPFD/EC/reservoir)
 *  - unknown units
 *  - non-finite values
 *  - captured_at more than 5 minutes in the future
 *  - silent timestamp clamping
 *  - client-provided user_id
 *  - partial batches (all-or-nothing — caller enforces, this module reports
 *    every issue so the caller can refuse the whole batch)
 */

import type { ExternalSensorIngestPayload } from "./sensorIngestNormalizationRules";

// ----------------------------- Types -----------------------------

export type PiIngestAllowedMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct";

export type PiIngestAllowedSource = "pi_bridge";

/** Canonical unit string accepted by `sensorIngestNormalizationRules`. */
export type CanonicalIngestUnit =
  | "temperature_c"
  | "temperature_f"
  | "percent"
  | "kPa"
  | "ppm";

export const PI_INGEST_ALLOWED_METRICS: readonly PiIngestAllowedMetric[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;

export const PI_INGEST_ALLOWED_SOURCES: readonly PiIngestAllowedSource[] = [
  "pi_bridge",
] as const;

/** Explicitly forbidden metrics from the V0 contract. */
export const PI_INGEST_FORBIDDEN_METRICS: readonly string[] = [
  "ppfd",
  "dli",
  "soil_ec",
  "soil_temp",
  "reservoir_ec",
  "reservoir_ph",
  "reservoir_temp",
] as const;

export interface PiIngestReadingEnvelope {
  metric: unknown;
  value: unknown;
  unit: unknown;
  quality?: unknown;
}

export interface PiIngestRequestEnvelope {
  tent_id?: unknown;
  device_id?: unknown;
  captured_at?: unknown;
  source?: unknown;
  readings?: unknown;
  raw?: unknown;
  /**
   * Reserved: callers MUST NOT send `user_id`. If present, the validator
   * rejects the request to prevent ownership spoofing.
   */
  user_id?: unknown;
}

export type PiIngestRequestValidationFailureCode =
  | "invalid_envelope"
  | "missing_tent_id"
  | "missing_device_id"
  | "missing_captured_at"
  | "invalid_captured_at"
  | "captured_at_too_far_future"
  | "missing_source"
  | "invalid_source"
  | "missing_readings"
  | "empty_readings"
  | "invalid_reading"
  | "missing_metric"
  | "invalid_metric"
  | "forbidden_metric"
  | "missing_unit"
  | "invalid_unit"
  | "missing_value"
  | "non_finite_value"
  | "client_user_id_forbidden";

export interface PiIngestRequestValidationIssue {
  readonly code: PiIngestRequestValidationFailureCode;
  readonly message: string;
  readonly index?: number;
}

export interface ValidatedPiIngestEnvelope {
  readonly tent_id: string;
  readonly device_id: string;
  readonly captured_at: string; // canonical ISO 8601 UTC
  readonly source: PiIngestAllowedSource;
  readonly readings: ReadonlyArray<{
    readonly metric: PiIngestAllowedMetric;
    readonly value: number;
    readonly unit: CanonicalIngestUnit;
    readonly quality?: string | null;
  }>;
  readonly raw: unknown;
}

export type PiIngestRequestValidationResult =
  | { readonly ok: true; readonly envelope: ValidatedPiIngestEnvelope }
  | {
      readonly ok: false;
      readonly issues: readonly PiIngestRequestValidationIssue[];
    };

export interface PiIngestRequestValidationOptions {
  /** Injectable current time for deterministic testing. */
  readonly now?: Date;
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// ----------------------------- Allowlist helpers -----------------------------

export function isAllowedPiIngestMetric(
  metric: unknown,
): metric is PiIngestAllowedMetric {
  return (
    typeof metric === "string" &&
    (PI_INGEST_ALLOWED_METRICS as readonly string[]).includes(metric)
  );
}

export function isAllowedPiIngestSource(
  source: unknown,
): source is PiIngestAllowedSource {
  return (
    typeof source === "string" &&
    (PI_INGEST_ALLOWED_SOURCES as readonly string[]).includes(source)
  );
}

/**
 * Normalize a wire-format unit string to the canonical unit expected by
 * `sensorIngestNormalizationRules`. Returns `null` if the unit is not
 * accepted for the given metric.
 */
function normalizeUnit(
  metric: PiIngestAllowedMetric,
  rawUnit: unknown,
): CanonicalIngestUnit | null {
  if (typeof rawUnit !== "string") return null;
  const u = rawUnit.trim();
  if (!u) return null;
  const lower = u.toLowerCase();
  switch (metric) {
    case "temperature_c":
      if (lower === "c" || lower === "celsius" || lower === "temperature_c")
        return "temperature_c";
      if (lower === "f" || lower === "fahrenheit" || lower === "temperature_f")
        return "temperature_f";
      return null;
    case "humidity_pct":
    case "soil_moisture_pct":
      if (lower === "%" || lower === "percent" || lower === "pct")
        return "percent";
      return null;
    case "vpd_kpa":
      if (lower === "kpa") return "kPa";
      return null;
    case "co2_ppm":
      if (lower === "ppm") return "ppm";
      return null;
  }
}

export function isAllowedPiIngestUnit(
  metric: unknown,
  unit: unknown,
): boolean {
  if (!isAllowedPiIngestMetric(metric)) return false;
  return normalizeUnit(metric, unit) !== null;
}

// ----------------------------- Validator -----------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validatePiIngestRequestEnvelope(
  input: unknown,
  options: PiIngestRequestValidationOptions = {},
): PiIngestRequestValidationResult {
  const issues: PiIngestRequestValidationIssue[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        { code: "invalid_envelope", message: "request body must be a JSON object" },
      ],
    };
  }

  const env = input as PiIngestRequestEnvelope;

  if ("user_id" in (env as object) && env.user_id !== undefined) {
    issues.push({
      code: "client_user_id_forbidden",
      message: "client-provided user_id is not allowed",
    });
  }

  if (!isNonEmptyString(env.tent_id))
    issues.push({ code: "missing_tent_id", message: "tent_id is required" });

  if (!isNonEmptyString(env.device_id))
    issues.push({ code: "missing_device_id", message: "device_id is required" });

  let capturedIso: string | null = null;
  if (env.captured_at === undefined || env.captured_at === null || env.captured_at === "") {
    issues.push({
      code: "missing_captured_at",
      message: "captured_at is required",
    });
  } else if (typeof env.captured_at !== "string") {
    issues.push({
      code: "invalid_captured_at",
      message: "captured_at must be an ISO 8601 string",
    });
  } else {
    const ms = Date.parse(env.captured_at);
    if (!Number.isFinite(ms)) {
      issues.push({
        code: "invalid_captured_at",
        message: `invalid captured_at: ${env.captured_at}`,
      });
    } else {
      const now = (options.now ?? new Date()).getTime();
      if (ms > now + FUTURE_TOLERANCE_MS) {
        issues.push({
          code: "captured_at_too_far_future",
          message: "captured_at is more than 5 minutes in the future",
        });
      } else {
        capturedIso = new Date(ms).toISOString();
      }
    }
  }

  if (env.source === undefined || env.source === null || env.source === "") {
    issues.push({ code: "missing_source", message: "source is required" });
  } else if (!isAllowedPiIngestSource(env.source)) {
    issues.push({
      code: "invalid_source",
      message: `source must be 'pi_bridge' (got: ${String(env.source)})`,
    });
  }

  if (env.readings === undefined || env.readings === null) {
    issues.push({ code: "missing_readings", message: "readings is required" });
  } else if (!Array.isArray(env.readings)) {
    issues.push({
      code: "missing_readings",
      message: "readings must be an array",
    });
  } else if (env.readings.length === 0) {
    issues.push({ code: "empty_readings", message: "readings must be non-empty" });
  }

  const validatedReadings: Array<{
    metric: PiIngestAllowedMetric;
    value: number;
    unit: CanonicalIngestUnit;
    quality?: string | null;
  }> = [];

  if (Array.isArray(env.readings)) {
    env.readings.forEach((r: unknown, idx: number) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        issues.push({
          code: "invalid_reading",
          message: `reading ${idx} must be an object`,
          index: idx,
        });
        return;
      }
      const reading = r as PiIngestReadingEnvelope;
      const metric = reading.metric;
      if (metric === undefined || metric === null || metric === "") {
        issues.push({
          code: "missing_metric",
          message: `reading ${idx}: metric is required`,
          index: idx,
        });
      } else if (typeof metric !== "string") {
        issues.push({
          code: "invalid_metric",
          message: `reading ${idx}: metric must be a string`,
          index: idx,
        });
      } else if (
        (PI_INGEST_FORBIDDEN_METRICS as readonly string[]).includes(metric)
      ) {
        issues.push({
          code: "forbidden_metric",
          message: `reading ${idx}: metric '${metric}' is not supported by V0`,
          index: idx,
        });
      } else if (!isAllowedPiIngestMetric(metric)) {
        issues.push({
          code: "invalid_metric",
          message: `reading ${idx}: unknown metric '${metric}'`,
          index: idx,
        });
      }

      if (reading.unit === undefined || reading.unit === null || reading.unit === "") {
        issues.push({
          code: "missing_unit",
          message: `reading ${idx}: unit is required`,
          index: idx,
        });
      }

      if (reading.value === undefined || reading.value === null) {
        issues.push({
          code: "missing_value",
          message: `reading ${idx}: value is required`,
          index: idx,
        });
      } else if (typeof reading.value !== "number" || !Number.isFinite(reading.value)) {
        issues.push({
          code: "non_finite_value",
          message: `reading ${idx}: value must be a finite number`,
          index: idx,
        });
      }

      // Only attempt unit normalization if metric and unit and value are all valid so far.
      if (
        isAllowedPiIngestMetric(metric) &&
        reading.unit !== undefined &&
        reading.unit !== null &&
        reading.unit !== "" &&
        typeof reading.value === "number" &&
        Number.isFinite(reading.value)
      ) {
        const canonical = normalizeUnit(metric, reading.unit);
        if (canonical === null) {
          issues.push({
            code: "invalid_unit",
            message: `reading ${idx}: unit '${String(reading.unit)}' is not valid for metric '${metric}'`,
            index: idx,
          });
        } else {
          const quality =
            typeof reading.quality === "string" ? reading.quality : undefined;
          validatedReadings.push({
            metric,
            value: reading.value,
            unit: canonical,
            ...(quality !== undefined ? { quality } : {}),
          });
        }
      }
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    envelope: {
      tent_id: (env.tent_id as string).trim(),
      device_id: (env.device_id as string).trim(),
      captured_at: capturedIso as string,
      source: env.source as PiIngestAllowedSource,
      readings: validatedReadings,
      raw: env.raw,
    },
  };
}

// ----------------------------- Adapter -----------------------------

/**
 * Translate a validated envelope into the `ExternalSensorIngestPayload`
 * accepted by `normalizeIngestPayload`. This is a pure mapping; it never
 * writes and never re-validates.
 */
export function toExternalSensorIngestPayload(
  envelope: ValidatedPiIngestEnvelope,
): ExternalSensorIngestPayload {
  return {
    tent_id: envelope.tent_id,
    device_id: envelope.device_id,
    captured_at: envelope.captured_at,
    source: envelope.source,
    readings: envelope.readings.map((r) => ({
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      quality: r.quality ?? null,
    })),
    raw_payload: envelope.raw,
  };
}

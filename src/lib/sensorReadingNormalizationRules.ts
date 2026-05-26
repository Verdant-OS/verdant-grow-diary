/**
 * Pure domain sensor truth layer for Verdant hardware integration.
 *
 * Defines the normalized sensor reading schema, source classification,
 * stale/invalid detection, and deterministic helpers.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks.
 *  - Invalid telemetry NEVER returns a healthy/live classification.
 *  - Missing CO2 does NOT create false risk (partial readings are OK).
 *  - raw_payload is preserved verbatim and never consulted for decisions.
 *  - All time-dependent logic accepts injectable `now` for determinism.
 */

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

/**
 * How the reading entered the system.
 *
 * - live      : real-time hardware telemetry (sensor active)
 * - manual    : user-entered value
 * - demo      : synthetic/simulated data, must never flow to alerts
 * - stale     : previously live, now past the freshness threshold
 * - invalid   : failed validation; never safe to act on
 * - imported  : historically ingested from an external source (e.g. CSV)
 */
export type NormalizedReadingSource = "live" | "manual" | "demo" | "stale" | "invalid" | "imported";

export const NORMALIZED_READING_SOURCES: readonly NormalizedReadingSource[] = [
  "live",
  "manual",
  "demo",
  "stale",
  "invalid",
  "imported",
] as const;

/** Sources that are safe to surface in UI as actionable data. */
export const ACTIONABLE_SOURCES: readonly NormalizedReadingSource[] = [
  "live",
  "manual",
  "imported",
] as const;

/** Sources that must never trigger alerts or automation. */
export const NON_ALERTABLE_SOURCES: readonly NormalizedReadingSource[] = [
  "demo",
  "stale",
  "invalid",
] as const;

// ---------------------------------------------------------------------------
// Normalized reading type
// ---------------------------------------------------------------------------

/**
 * A fully normalized sensor reading as consumed by the Verdant domain layer.
 *
 * All metric fields are optional (`null` = not present in this reading).
 * Partial readings are explicitly supported — a missing `co2_ppm` is not
 * treated as a risk signal.
 */
export interface NormalizedSensorReading {
  /** Unique identifier of the reading (UUID). */
  id: string;
  /** Grow tent this reading belongs to. */
  tent_id: string;
  /** Optional originating device (hardware ID, Pi serial, etc.). */
  device_id: string | null;
  /** ISO-8601 timestamp when the reading was captured by the sensor. */
  captured_at: string;
  /** ISO-8601 timestamp when the reading was stored in the system. */
  recorded_at: string;
  /** Classified source — see NormalizedReadingSource. */
  source: NormalizedReadingSource;
  /** Temperature in °C. null if not present. */
  temperature_c: number | null;
  /** Relative humidity 0–100 %. null if not present. */
  humidity_pct: number | null;
  /** Vapour-Pressure Deficit in kPa. null if not present. */
  vpd_kpa: number | null;
  /** CO₂ concentration in ppm. null if not present (not a risk signal). */
  co2_ppm: number | null;
  /** Substrate moisture 0–100 %. null if not present. */
  soil_moisture_pct: number | null;
  /**
   * Verbatim raw payload received from the hardware or ingest adapter.
   * MUST NOT be used for any domain decision — preserved for audit only.
   */
  raw_payload: unknown | null;
}

// ---------------------------------------------------------------------------
// Stale detection
// ---------------------------------------------------------------------------

/** Default freshness threshold: 30 minutes. */
export const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Returns `true` when the reading's `captured_at` timestamp is older than
 * `thresholdMs` relative to `now`.
 *
 * Readings with an unparseable timestamp are treated as NOT stale (unknown
 * staleness is distinct from confirmed staleness).
 *
 * @param capturedAt  ISO-8601 string from the reading.
 * @param now         Current epoch ms. Injectable for deterministic tests.
 * @param thresholdMs Staleness window in ms. Defaults to STALE_THRESHOLD_MS.
 */
export function isReadingStale(
  capturedAt: string | null,
  now: number = Date.now(),
  thresholdMs: number = STALE_THRESHOLD_MS,
): boolean {
  if (!capturedAt) return false;
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > thresholdMs;
}

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

export function isLiveSource(source: NormalizedReadingSource): boolean {
  return source === "live";
}

export function isActionableSource(source: NormalizedReadingSource): boolean {
  return (ACTIONABLE_SOURCES as readonly string[]).includes(source);
}

export function isNonAlertableSource(source: NormalizedReadingSource): boolean {
  return (NON_ALERTABLE_SOURCES as readonly string[]).includes(source);
}

// ---------------------------------------------------------------------------
// Invalid telemetry guards
// ---------------------------------------------------------------------------

export interface TelemetryValidationResult {
  valid: boolean;
  errors: string[];
}

/** Numeric bounds that plausible indoor-environment sensors should respect. */
const PLAUSIBLE_BOUNDS: Record<
  keyof Pick<
    NormalizedSensorReading,
    "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
  >,
  { min: number; max: number }
> = {
  temperature_c: { min: -10, max: 60 },
  humidity_pct: { min: 0, max: 100 },
  vpd_kpa: { min: 0, max: 5 },
  co2_ppm: { min: 0, max: 10_000 },
  soil_moisture_pct: { min: 0, max: 100 },
};

/**
 * Validates a raw telemetry object for well-formedness.
 *
 * Rules:
 *  - `tent_id` and `captured_at` are required.
 *  - `captured_at` must be a parseable ISO-8601 date and must not be in the
 *    future by more than 5 minutes.
 *  - At least one metric field must be present (non-null, finite number).
 *  - Each present metric must be within its plausible bounds.
 *  - Missing CO₂ is explicitly allowed — not an error.
 *  - An invalid reading NEVER receives a live/healthy classification.
 *
 * @param input Partial reading candidate from an ingest adapter.
 * @param now   Current epoch ms. Injectable for deterministic tests.
 */
export function validateTelemetry(
  input: Partial<NormalizedSensorReading> & { tent_id?: string; captured_at?: string },
  now: number = Date.now(),
): TelemetryValidationResult {
  const errors: string[] = [];

  if (!input.tent_id || typeof input.tent_id !== "string") {
    errors.push("tent_id is required");
  }

  if (!input.captured_at || typeof input.captured_at !== "string") {
    errors.push("captured_at is required");
  } else {
    const t = new Date(input.captured_at).getTime();
    if (!Number.isFinite(t)) {
      errors.push(`captured_at is not a valid date: ${input.captured_at}`);
    } else if (t > now + 5 * 60 * 1000) {
      errors.push(`captured_at is more than 5 minutes in the future: ${input.captured_at}`);
    }
  }

  const metricKeys = Object.keys(PLAUSIBLE_BOUNDS) as Array<keyof typeof PLAUSIBLE_BOUNDS>;
  let hasAtLeastOneMetric = false;

  for (const key of metricKeys) {
    const v = input[key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${key} must be a finite number, got: ${v}`);
      continue;
    }
    hasAtLeastOneMetric = true;
    const { min, max } = PLAUSIBLE_BOUNDS[key];
    if (v < min || v > max) {
      errors.push(`${key} out of plausible range [${min}, ${max}]: ${v}`);
    }
  }

  if (!hasAtLeastOneMetric && errors.length === 0) {
    errors.push("at least one metric field must be present");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Source classification from raw context
// ---------------------------------------------------------------------------

export interface RawReadingContext {
  /** Hardware source string as received from the adapter. */
  source_tag: string;
  /** Whether the reading's captured_at is past the staleness threshold. */
  is_stale: boolean;
  /** Whether validation failed on this reading. */
  is_invalid: boolean;
}

/**
 * Derives a `NormalizedReadingSource` from a raw context object.
 *
 * Priority order (highest wins):
 *  1. invalid  — failed validation beats all
 *  2. stale    — stale beats source tag
 *  3. demo/sim — synthetic data is never live
 *  4. manual   — user-entered
 *  5. imported — historical ingest
 *  6. live     — default for unknown/hardware tags
 */
export function classifyReadingSource(ctx: RawReadingContext): NormalizedReadingSource {
  if (ctx.is_invalid) return "invalid";
  if (ctx.is_stale) return "stale";

  const tag = ctx.source_tag.toLowerCase();
  if (tag === "sim" || tag === "demo" || tag === "simulated") return "demo";
  if (tag === "manual") return "manual";
  if (tag === "imported" || tag === "csv" || tag === "historical") return "imported";
  return "live";
}

// ---------------------------------------------------------------------------
// Partial reading support
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the reading has at least one non-null metric.
 * A reading with only null metrics is not useful but is not necessarily invalid.
 */
export function hasAnyMetric(
  reading: Pick<
    NormalizedSensorReading,
    "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
  >,
): boolean {
  return (
    reading.temperature_c !== null ||
    reading.humidity_pct !== null ||
    reading.vpd_kpa !== null ||
    reading.co2_ppm !== null ||
    reading.soil_moisture_pct !== null
  );
}

/**
 * Returns the set of metric field names that are present (non-null) in a
 * normalized reading. Useful for display and partial-update logic.
 */
export function presentMetrics(
  reading: Pick<
    NormalizedSensorReading,
    "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
  >,
): string[] {
  const fields: Array<keyof typeof reading> = [
    "temperature_c",
    "humidity_pct",
    "vpd_kpa",
    "co2_ppm",
    "soil_moisture_pct",
  ];
  return fields.filter((f) => reading[f] !== null);
}

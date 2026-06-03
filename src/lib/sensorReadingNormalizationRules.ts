/**
 * NEX-5: Normalized sensor reading schema and source tagging.
 *
 * Pure domain "sensor truth layer" for Verdant hardware integration.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks.
 *  - No UI files changed.
 *  - No automation introduced.
 *  - No device control.
 *  - No action_queue writes.
 *  - No service_role usage.
 *  - Missing CO₂ does NOT create false risk.
 *  - Invalid telemetry NEVER returns healthy/live state.
 *  - All source states are explicitly distinguishable.
 *  - Raw payload preserved verbatim; never consulted for downstream logic.
 */

// ---------------------------------------------------------------------------
// Source Classification
// ---------------------------------------------------------------------------

/**
 * Exhaustive source classification for normalized readings.
 *
 * - `live`     – real-time from a connected hardware device
 * - `manual`   – user-entered via the app
 * - `demo`     – synthetic/demo data for onboarding or testing
 * - `stale`    – was live but exceeded freshness threshold
 * - `invalid`  – telemetry failed validation guards
 * - `imported` – bulk import from CSV/external system
 */
export type ReadingSource = "live" | "manual" | "demo" | "stale" | "invalid" | "imported";

export const ALL_READING_SOURCES: readonly ReadingSource[] = [
  "live",
  "manual",
  "demo",
  "stale",
  "invalid",
  "imported",
] as const;

export const SOURCE_LABELS: Record<ReadingSource, string> = {
  live: "Live sensor",
  manual: "Manual entry",
  demo: "Demo data",
  stale: "Stale reading",
  invalid: "Invalid telemetry",
  imported: "Imported",
};

// ---------------------------------------------------------------------------
// Normalized Sensor Reading Type
// ---------------------------------------------------------------------------

export interface NormalizedSensorReading {
  /** ISO-8601 timestamp of capture */
  captured_at: string;
  /** Classified source tag */
  source: ReadingSource;
  /** Temperature in °C (nullable – partial readings allowed) */
  temperature_c: number | null;
  /** Relative humidity 0–100% (nullable) */
  humidity_pct: number | null;
  /** Vapour-pressure deficit in kPa (nullable) */
  vpd_kpa: number | null;
  /** CO₂ concentration in ppm (nullable – missing does NOT imply risk) */
  co2_ppm: number | null;
  /** Soil moisture 0–100% (nullable) */
  soil_moisture_pct: number | null;
  /**
   * PPFD in µmol/m²/s (nullable). Optional on construction so legacy
   * inputs without a PAR sensor still type-check. Never derived from
   * lux, wattage, or device state — only set when a real measurement
   * exists.
   */
  ppfd_umol_m2s?: number | null;
  /** Original unmodified payload from the source device/input */
  raw_payload: unknown;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default freshness threshold: 30 minutes in milliseconds. */
export const STALE_THRESHOLD_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Validation Guards
// ---------------------------------------------------------------------------

/** Returns true if temperature is within plausible indoor grow range. */
export function isTemperatureValid(v: number | null): boolean {
  if (v === null) return true; // missing is not invalid
  return Number.isFinite(v) && v >= -10 && v <= 60;
}

/** Returns true if humidity is within 0–100% and not a known fault value. */
export function isHumidityValid(v: number | null): boolean {
  if (v === null) return true;
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Returns true if VPD is within plausible range. */
export function isVpdValid(v: number | null): boolean {
  if (v === null) return true;
  return Number.isFinite(v) && v >= 0 && v <= 10;
}

/** Returns true if CO₂ is within plausible range. */
export function isCo2Valid(v: number | null): boolean {
  if (v === null) return true; // missing CO₂ is not a risk signal
  return Number.isFinite(v) && v >= 0 && v <= 5000;
}

/** Returns true if soil moisture is within 0–100%. */
export function isSoilMoistureValid(v: number | null): boolean {
  if (v === null) return true;
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Returns true if ALL present metric values pass their respective guards. */
export function isReadingTelemetryValid(
  reading: Pick<
    NormalizedSensorReading,
    "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
  >,
): boolean {
  return (
    isTemperatureValid(reading.temperature_c) &&
    isHumidityValid(reading.humidity_pct) &&
    isVpdValid(reading.vpd_kpa) &&
    isCo2Valid(reading.co2_ppm) &&
    isSoilMoistureValid(reading.soil_moisture_pct)
  );
}

// ---------------------------------------------------------------------------
// Stale Detection
// ---------------------------------------------------------------------------

/**
 * Determines whether a reading is stale based on its `captured_at` timestamp
 * and the provided `now` reference (injectable for determinism in tests).
 */
export function isReadingStale(
  capturedAt: string,
  now: number = Date.now(),
  thresholdMs: number = STALE_THRESHOLD_MS,
): boolean {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return true; // unparseable → treat as stale
  return now - t > thresholdMs;
}

// ---------------------------------------------------------------------------
// Source Classification Logic
// ---------------------------------------------------------------------------

export interface ClassifySourceInput {
  /** Original source hint from caller (e.g. "live", "manual", "demo", "imported") */
  declaredSource: string;
  /** ISO-8601 captured_at timestamp */
  capturedAt: string;
  /** Metric values for validity check */
  metrics: Pick<
    NormalizedSensorReading,
    "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct"
  >;
  /** Injectable clock for deterministic tests */
  now?: number;
  /** Custom stale threshold override */
  staleThresholdMs?: number;
}

/**
 * Classify the effective source of a sensor reading.
 *
 * Priority:
 *  1. If telemetry is invalid → `"invalid"` (safety-first)
 *  2. If declared source is `"live"` and reading is stale → `"stale"`
 *  3. Otherwise → declared source if it's a known ReadingSource, else `"invalid"`
 */
export function classifySource(input: ClassifySourceInput): ReadingSource {
  const { declaredSource, capturedAt, metrics, now, staleThresholdMs } = input;

  // Safety-first: invalid telemetry never returns a healthy source
  if (!isReadingTelemetryValid(metrics)) {
    return "invalid";
  }

  // Check if declared source is a known value
  const knownSources: Set<string> = new Set(ALL_READING_SOURCES);
  if (!knownSources.has(declaredSource)) {
    return "invalid";
  }

  // Stale detection only applies to live readings
  if (declaredSource === "live" && isReadingStale(capturedAt, now, staleThresholdMs)) {
    return "stale";
  }

  return declaredSource as ReadingSource;
}

// ---------------------------------------------------------------------------
// Normalization Entry Point
// ---------------------------------------------------------------------------

export interface RawSensorInput {
  /** ISO-8601 captured timestamp */
  captured_at: string;
  /** Declared source from the caller */
  source: string;
  /** Temperature in °C */
  temperature_c?: number | null;
  /** Humidity 0–100% */
  humidity_pct?: number | null;
  /** VPD in kPa */
  vpd_kpa?: number | null;
  /** CO₂ in ppm */
  co2_ppm?: number | null;
  /** Soil moisture 0–100% */
  soil_moisture_pct?: number | null;
  /** PPFD in µmol/m²/s (only when a real PAR/PPFD measurement exists) */
  ppfd_umol_m2s?: number | null;
  /** Original payload to preserve */
  raw_payload?: unknown;
}

/** Returns true if PPFD is within plausible canopy range 0..2500 µmol/m²/s. */
export function isPpfdReadingValid(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true; // missing PPFD is not a risk
  return Number.isFinite(v) && v >= 0 && v <= 2500;
}

/**
 * Normalize a raw sensor input into a fully classified NormalizedSensorReading.
 *
 * - Applies telemetry validation guards
 * - Detects staleness (with injectable `now()`)
 * - Classifies source
 * - Preserves raw_payload verbatim
 * - Supports partial readings (null metrics are allowed)
 */
export function normalizeSensorReading(
  input: RawSensorInput,
  now: number = Date.now(),
  staleThresholdMs: number = STALE_THRESHOLD_MS,
): NormalizedSensorReading {
  const metrics = {
    temperature_c: input.temperature_c ?? null,
    humidity_pct: input.humidity_pct ?? null,
    vpd_kpa: input.vpd_kpa ?? null,
    co2_ppm: input.co2_ppm ?? null,
    soil_moisture_pct: input.soil_moisture_pct ?? null,
  };

  const source = classifySource({
    declaredSource: input.source,
    capturedAt: input.captured_at,
    metrics,
    now,
    staleThresholdMs,
  });

  return {
    captured_at: input.captured_at,
    source,
    ...metrics,
    ppfd_umol_m2s: input.ppfd_umol_m2s ?? null,
    raw_payload: input.raw_payload ?? null,
  };
}

/**
 * manualSensorSnapshotRules — pure validation + normalization helpers for
 * a Manual Sensor Snapshot (the grower-recorded environment + root-zone
 * reading a tent or plant gets when no live sensor is available).
 *
 * Scope:
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Never labels a snapshot as "live".
 *  - Never invents demo values; missing fields stay missing.
 *  - Validates the FULL grower-facing field set (air temp, humidity, VPD,
 *    CO2, soil moisture, soil temp, soil EC, reservoir pH, reservoir EC,
 *    PPFD, notes). The persistence layer is a separate concern — see
 *    src/lib/sensorReadingManualEntryRules.ts for the DB-trigger-allowed
 *    subset that actually goes into sensor_readings.
 *  - Surfaces suspicious-but-allowed values as `warnings` instead of
 *    silently classifying them as healthy.
 *
 * Constraints enforced by tests:
 *  - Humidity outside 0..100 → invalid.
 *  - pH outside realistic 3.5..8.5 cultivation range → warning.
 *  - Reservoir EC entered as a number that looks like µS/cm (> 50 mS/cm
 *    when "mS/cm" was selected) → warning ("looks like µS/cm").
 *  - Air temp declared in °F but the numeric value is consistent with a
 *    Celsius reading mislabeled as Fahrenheit (≤ 45) → warning.
 *  - Soil moisture stuck at exactly 0 or 100 → warning.
 *  - VPD helper returns "needs_inputs" when temp or RH is missing.
 *  - VPD helper output is deterministic and rounded to 3 decimal places.
 */

// ---------- Public types ----------

export type ManualSnapshotTempUnit = "F" | "C";
export type ManualSnapshotEcUnit = "mS/cm" | "uS/cm";

export interface ManualSnapshotInput {
  airTemp?: string | number | null;
  airTempUnit?: ManualSnapshotTempUnit;
  humidityPct?: string | number | null;
  vpdKpa?: string | number | null;
  co2Ppm?: string | number | null;
  soilMoisturePct?: string | number | null;
  soilTempC?: string | number | null;
  soilEc?: string | number | null;
  soilEcUnit?: ManualSnapshotEcUnit;
  reservoirPh?: string | number | null;
  reservoirEc?: string | number | null;
  reservoirEcUnit?: ManualSnapshotEcUnit;
  ppfd?: string | number | null;
  notes?: string | null;
}

export interface ManualSnapshotMetric {
  field:
    | "air_temp_c"
    | "humidity_pct"
    | "vpd_kpa"
    | "co2_ppm"
    | "soil_moisture_pct"
    | "soil_temp_c"
    | "soil_ec_mscm"
    | "reservoir_ph"
    | "reservoir_ec_mscm"
    | "ppfd";
  /** Canonical-unit value. Never null when present in the metrics array. */
  value: number;
  /** True when the helper derived this value (e.g. VPD from temp+RH). */
  derived?: boolean;
}

export type VpdState =
  | { state: "computed"; valueKpa: number }
  | { state: "needs_inputs"; message: string };

export interface ManualSnapshotValidation {
  /** OK when there are no hard errors AND at least one metric is present. */
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: ManualSnapshotMetric[];
  vpd: VpdState | null;
  /** Always "manual". Never "live". */
  source: "manual";
}

// ---------- Constants ----------

export const PH_REALISTIC_RANGE = { min: 3.5, max: 8.5 } as const;
/** Reservoir EC expressed as mS/cm rarely exceeds this; higher values usually
 *  indicate the grower typed a µS/cm reading by mistake. */
export const EC_SUSPICIOUS_MSCM_MAX = 50;
/** Air temp DECLARED in °F but numerically ≤ this is almost certainly a
 *  Celsius reading entered in the Fahrenheit field. 45°F is ~7°C — below
 *  any indoor cultivation environment. */
export const FAHRENHEIT_LOOKS_LIKE_CELSIUS_MAX = 45;
export const SOIL_MOISTURE_STUCK_VALUES = [0, 100] as const;

// ---------- Internals ----------

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function usToMs(us: number): number {
  return us / 1000;
}

// ---------- VPD ----------

/**
 * Saturation vapor pressure (kPa) via Tetens — standard horticulture
 * approximation. Pure and deterministic.
 *
 * Returns `{ state: "needs_inputs" }` when temp or RH is missing. Never
 * invents inputs.
 */
export function computeVpdKpa(
  args: { tempC: number | null; rhPct: number | null },
): VpdState {
  const { tempC, rhPct } = args;
  if (tempC === null || rhPct === null) {
    return { state: "needs_inputs", message: "Needs temperature and humidity." };
  }
  if (!Number.isFinite(tempC) || !Number.isFinite(rhPct)) {
    return { state: "needs_inputs", message: "Needs temperature and humidity." };
  }
  if (rhPct < 0 || rhPct > 100) {
    return { state: "needs_inputs", message: "Needs temperature and humidity." };
  }
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = svp * (1 - rhPct / 100);
  return { state: "computed", valueKpa: roundTo(Math.max(0, vpd), 3) };
}

// ---------- Validation ----------

export function validateManualSnapshot(
  input: ManualSnapshotInput,
): ManualSnapshotValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metrics: ManualSnapshotMetric[] = [];

  const airTempUnit: ManualSnapshotTempUnit = input.airTempUnit ?? "F";
  const ecUnit: ManualSnapshotEcUnit = input.soilEcUnit ?? "mS/cm";
  const resEcUnit: ManualSnapshotEcUnit = input.reservoirEcUnit ?? "mS/cm";

  const airTempRaw = toFinite(input.airTemp);
  const humidity = toFinite(input.humidityPct);
  const vpdRaw = toFinite(input.vpdKpa);
  const co2 = toFinite(input.co2Ppm);
  const soil = toFinite(input.soilMoisturePct);
  const soilTempC = toFinite(input.soilTempC);
  const soilEcRaw = toFinite(input.soilEc);
  const resPh = toFinite(input.reservoirPh);
  const resEcRaw = toFinite(input.reservoirEc);
  const ppfd = toFinite(input.ppfd);

  // ----- Hard errors (impossible values) -----
  if (humidity !== null && (humidity < 0 || humidity > 100)) {
    errors.push("Humidity must be between 0% and 100%.");
  }
  if (soil !== null && (soil < 0 || soil > 100)) {
    errors.push("Soil moisture must be between 0% and 100%.");
  }
  if (co2 !== null && co2 < 0) errors.push("CO₂ ppm cannot be negative.");
  if (vpdRaw !== null && vpdRaw < 0) errors.push("VPD cannot be negative.");
  if (ppfd !== null && ppfd < 0) errors.push("PPFD cannot be negative.");
  if (soilEcRaw !== null && soilEcRaw < 0) errors.push("Soil EC cannot be negative.");
  if (resEcRaw !== null && resEcRaw < 0) errors.push("Reservoir EC cannot be negative.");

  // ----- pH realistic-range warning (does NOT classify as healthy) -----
  if (resPh !== null) {
    if (resPh < 0 || resPh > 14) {
      errors.push("Reservoir pH must be between 0 and 14.");
    } else if (resPh < PH_REALISTIC_RANGE.min || resPh > PH_REALISTIC_RANGE.max) {
      warnings.push(
        `Reservoir pH ${resPh} is outside the realistic ${PH_REALISTIC_RANGE.min}–${PH_REALISTIC_RANGE.max} cultivation range.`,
      );
    }
  }

  // ----- Celsius-as-Fahrenheit warning -----
  // The grower picked °F but the entered number is too low to be a real
  // indoor-room °F — it almost certainly is a °C value.
  if (airTempRaw !== null && airTempUnit === "F" && airTempRaw <= FAHRENHEIT_LOOKS_LIKE_CELSIUS_MAX) {
    warnings.push(
      `Air temp ${airTempRaw}°F looks like a Celsius reading entered in the Fahrenheit field.`,
    );
  }

  // ----- EC unit suspicion (warning only, never invalid) -----
  if (resEcRaw !== null && resEcUnit === "mS/cm" && resEcRaw > EC_SUSPICIOUS_MSCM_MAX) {
    warnings.push(
      `Reservoir EC ${resEcRaw} looks like µS/cm while mS/cm is selected; may be a unit mismatch.`,
    );
  }
  if (soilEcRaw !== null && ecUnit === "mS/cm" && soilEcRaw > EC_SUSPICIOUS_MSCM_MAX) {
    warnings.push(
      `Soil EC ${soilEcRaw} looks like µS/cm while mS/cm is selected; may be a unit mismatch.`,
    );
  }

  // ----- Soil moisture stuck values -----
  if (soil !== null && SOIL_MOISTURE_STUCK_VALUES.includes(soil as 0 | 100)) {
    warnings.push(
      `Soil moisture ${soil}% may indicate a stuck or unread sensor; review before trusting.`,
    );
  }

  // ----- Build canonical metric list (skip values blocked by errors above) -----
  if (airTempRaw !== null) {
    const airTempC = airTempUnit === "F" ? fahrenheitToCelsius(airTempRaw) : airTempRaw;
    metrics.push({ field: "air_temp_c", value: roundTo(airTempC, 2) });
  }
  if (humidity !== null && humidity >= 0 && humidity <= 100) {
    metrics.push({ field: "humidity_pct", value: humidity });
  }
  if (co2 !== null && co2 >= 0) metrics.push({ field: "co2_ppm", value: co2 });
  if (soil !== null && soil >= 0 && soil <= 100) {
    metrics.push({ field: "soil_moisture_pct", value: soil });
  }
  if (soilTempC !== null) {
    metrics.push({ field: "soil_temp_c", value: roundTo(soilTempC, 2) });
  }
  if (soilEcRaw !== null && soilEcRaw >= 0) {
    const v = ecUnit === "uS/cm" ? usToMs(soilEcRaw) : soilEcRaw;
    metrics.push({ field: "soil_ec_mscm", value: roundTo(v, 3) });
  }
  if (resPh !== null && resPh >= 0 && resPh <= 14) {
    metrics.push({ field: "reservoir_ph", value: resPh });
  }
  if (resEcRaw !== null && resEcRaw >= 0) {
    const v = resEcUnit === "uS/cm" ? usToMs(resEcRaw) : resEcRaw;
    metrics.push({ field: "reservoir_ec_mscm", value: roundTo(v, 3) });
  }
  if (ppfd !== null && ppfd >= 0) metrics.push({ field: "ppfd", value: ppfd });

  // ----- VPD: prefer entered value; otherwise derive from temp+RH -----
  let vpdState: VpdState | null = null;
  if (vpdRaw !== null && vpdRaw >= 0) {
    metrics.push({ field: "vpd_kpa", value: roundTo(vpdRaw, 3) });
    vpdState = { state: "computed", valueKpa: roundTo(vpdRaw, 3) };
  } else {
    const airTempCForVpd =
      airTempRaw === null
        ? null
        : airTempUnit === "F"
          ? fahrenheitToCelsius(airTempRaw)
          : airTempRaw;
    const rhForVpd = humidity !== null && humidity >= 0 && humidity <= 100 ? humidity : null;
    const derived = computeVpdKpa({ tempC: airTempCForVpd, rhPct: rhForVpd });
    vpdState = derived;
    if (derived.state === "computed") {
      metrics.push({ field: "vpd_kpa", value: derived.valueKpa, derived: true });
    }
  }

  if (metrics.length === 0 && errors.length === 0) {
    errors.push("Enter at least one reading.");
  }

  return {
    ok: errors.length === 0 && metrics.length > 0,
    errors,
    warnings,
    metrics,
    vpd: vpdState,
    source: "manual",
  };
}

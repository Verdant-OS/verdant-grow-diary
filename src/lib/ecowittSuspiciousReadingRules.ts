/**
 * ecowittSuspiciousReadingRules — pure suspicious-data checks for
 * EcoWitt-shaped normalized readings.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O, no React, no timers.
 *  - Read-only: never writes to alerts, action_queue, devices.
 *  - Never marks unknown / malformed / out-of-range telemetry as healthy.
 *    Suspicious or invalid readings degrade snapshot state explicitly so
 *    presenters render an honest "invalid / unavailable" label.
 *  - Does not duplicate intake validation tables — only adds the four
 *    presenter-level guards the snapshot UI relies on:
 *      1. RH outside [0..100]                    → invalid
 *      2. Temperature outside [-20..60] °C        → invalid
 *      3. Stuck humidity at 0 or 100 (≥3 in a row)→ suspicious
 *      4. Stuck soil moisture at 0 or 100 (≥3)    → suspicious
 *      5. Celsius-looking Fahrenheit (≤45 °F)     → suspicious
 *      6. Impossible temp+RH combo (e.g. RH 0
 *         AND temp ≤ 0) → invalid
 */

export type EcowittSuspicionCode =
  | "rh_out_of_range_invalid"
  | "temperature_implausible_invalid"
  | "humidity_stuck_extreme"
  | "soil_moisture_stuck_extreme"
  | "celsius_looking_fahrenheit"
  | "impossible_temp_rh_combo";

export interface EcowittSuspicionFlag {
  code: EcowittSuspicionCode;
  severity: "suspicious" | "invalid";
  message: string;
}

export interface EcowittSuspicionInput {
  /** Temperature in °C as already normalized by the adapter. */
  temperatureC?: number | null;
  /** Humidity percent. */
  humidityPct?: number | null;
  /** Soil moisture percent. */
  soilMoisturePct?: number | null;
  /**
   * Original Fahrenheit value as received from EcoWitt (before C conversion),
   * when available. Used to flag Celsius-looking Fahrenheit values.
   */
  rawTempF?: number | null;
  /**
   * History buffer of recent humidity samples for stuck-at-extreme detection,
   * newest-last. Optional — caller may omit when only one reading is known.
   */
  recentHumidityPct?: ReadonlyArray<number | null | undefined>;
  /** History buffer of recent soil moisture samples, newest-last. */
  recentSoilMoisturePct?: ReadonlyArray<number | null | undefined>;
}

export interface EcowittSuspicionResult {
  flags: EcowittSuspicionFlag[];
  /** Highest severity present, or null if no flags. */
  worst: "suspicious" | "invalid" | null;
  /** True if any flag is `invalid`. */
  hasInvalid: boolean;
}

const TEMP_C_MIN = -20;
const TEMP_C_MAX = 60;
const F_LOOKS_LIKE_C_MAX = 45; // 45 °F ≈ 7 °C; anything that "looks like a C reading"

const STUCK_RUN_LENGTH = 3;
const STUCK_EXTREMES = new Set<number>([0, 100]);

function isFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function lastStuckRun(
  samples: ReadonlyArray<number | null | undefined> | undefined,
): number | null {
  if (!samples || samples.length === 0) return null;
  const last = samples[samples.length - 1];
  if (!isFinite(last) || !STUCK_EXTREMES.has(last)) return null;
  let run = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i];
    if (isFinite(v) && v === last) run += 1;
    else break;
  }
  return run >= STUCK_RUN_LENGTH ? last : null;
}

/** Pure suspicious-data evaluator. Caller decides how to render. */
export function evaluateEcowittSuspicion(
  input: EcowittSuspicionInput,
): EcowittSuspicionResult {
  const flags: EcowittSuspicionFlag[] = [];

  // 1. RH out of [0..100] -> invalid
  if (isFinite(input.humidityPct) && (input.humidityPct < 0 || input.humidityPct > 100)) {
    flags.push({
      code: "rh_out_of_range_invalid",
      severity: "invalid",
      message: "Humidity reading is outside 0–100% and was marked unavailable.",
    });
  }

  // 2. Implausible temperature -> invalid
  if (isFinite(input.temperatureC) && (input.temperatureC < TEMP_C_MIN || input.temperatureC > TEMP_C_MAX)) {
    flags.push({
      code: "temperature_implausible_invalid",
      severity: "invalid",
      message: "Temperature reading is outside a realistic grow-room range and was marked unavailable.",
    });
  }

  // 3. Celsius-looking Fahrenheit -> suspicious
  if (isFinite(input.rawTempF) && input.rawTempF <= F_LOOKS_LIKE_C_MAX) {
    flags.push({
      code: "celsius_looking_fahrenheit",
      severity: "suspicious",
      message: "Temperature looks like a Celsius value but arrived on the Fahrenheit field. Verify gateway units.",
    });
  }

  // 4. Stuck humidity at extreme
  const stuckRh = lastStuckRun(input.recentHumidityPct);
  if (stuckRh != null) {
    flags.push({
      code: "humidity_stuck_extreme",
      severity: "suspicious",
      message: `Humidity has been stuck at ${stuckRh}% — sensor may be saturated or disconnected.`,
    });
  }

  // 5. Stuck soil moisture at extreme
  const stuckSoil = lastStuckRun(input.recentSoilMoisturePct);
  if (stuckSoil != null) {
    flags.push({
      code: "soil_moisture_stuck_extreme",
      severity: "suspicious",
      message: `Soil moisture has been stuck at ${stuckSoil}% — probe may be dry/short-circuited.`,
    });
  }

  // 6. Impossible combo: RH at hard 0 AND sub-freezing temp from the same source.
  if (
    isFinite(input.humidityPct) &&
    input.humidityPct === 0 &&
    isFinite(input.temperatureC) &&
    input.temperatureC <= 0
  ) {
    flags.push({
      code: "impossible_temp_rh_combo",
      severity: "invalid",
      message: "Temperature and humidity combination is physically implausible; reading marked unavailable.",
    });
  }

  const hasInvalid = flags.some((f) => f.severity === "invalid");
  const hasSuspicious = flags.some((f) => f.severity === "suspicious");
  const worst: EcowittSuspicionResult["worst"] = hasInvalid
    ? "invalid"
    : hasSuspicious
      ? "suspicious"
      : null;

  return { flags, worst, hasInvalid };
}

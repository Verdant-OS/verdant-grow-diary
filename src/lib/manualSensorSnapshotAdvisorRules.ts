/**
 * Manual Sensor Snapshot Advisor — pure, advisory-only guardrails.
 *
 * Goal: when growers enter a manual tent snapshot (especially from the
 * Daily Check `?method=sensor` flow), nudge them about suspicious values
 * BEFORE saving. Never blocks the save. Never claims a plant is healthy.
 * Never writes anything. Never controls devices.
 *
 * Scope:
 *  - Pure helpers only. No React, no I/O, no Supabase.
 *  - Does NOT replace `validateManualEntry` — that owns hard rejects.
 *  - Accepts optional inputs (soil EC, reservoir pH) that the persisted
 *    form does not currently save; they are advisory-only and exist so
 *    growers entering pen readings get the same gentle guardrails.
 *
 * Copy rules:
 *  - Kind, not shaming. Always ends with
 *    "Double-check this value before saving." or similar.
 *  - Forbidden wording: "perfect", "completed", "guaranteed healthy".
 */

import { computeVpdKpa, fahrenheitToCelsius } from "./sensorReadingManualEntryRules";

export interface ManualSnapshotAdvisorInput {
  /** Air temperature entered into the °F field. */
  airTempF?: string | number | null;
  /** Relative humidity %. */
  humidityPct?: string | number | null;
  /** VPD kPa, if grower entered it directly. */
  vpdKpa?: string | number | null;
  /** CO2 ppm. */
  co2Ppm?: string | number | null;
  /** Soil water content %. */
  soilMoisturePct?: string | number | null;
  /** Optional soil EC pen reading in mS/cm. Advisory-only. */
  soilEcMsCm?: string | number | null;
  /**
   * Optional soil EC pen reading in µS/cm. Advisory-only — used to detect
   * unit confusion when somebody enters 1200 µS/cm into a mS/cm field.
   */
  soilEcUsCm?: string | number | null;
  /** Optional reservoir pH. Advisory-only. */
  reservoirPh?: string | number | null;
}

export interface ManualSnapshotAdvisorResult {
  /** Friendly warning messages. Never block saving. */
  warnings: string[];
  /**
   * If temp + RH are present and VPD was NOT entered, this is a derived
   * VPD value (kPa) the UI can surface as a helper line. Null otherwise.
   */
  derivedVpdKpa: number | null;
}

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const DOUBLE_CHECK = "Double-check this value before saving.";

/**
 * Build advisory warnings + derived VPD helper from a manual snapshot
 * input. Pure. Deterministic. Never throws.
 */
export function evaluateManualSnapshotAdvisor(
  input: ManualSnapshotAdvisorInput,
): ManualSnapshotAdvisorResult {
  const warnings: string[] = [];

  const airTempF = toFinite(input.airTempF);
  const humidity = toFinite(input.humidityPct);
  const vpd = toFinite(input.vpdKpa);
  const co2 = toFinite(input.co2Ppm);
  const soil = toFinite(input.soilMoisturePct);
  const ecMs = toFinite(input.soilEcMsCm);
  const ecUs = toFinite(input.soilEcUsCm);
  const ph = toFinite(input.reservoirPh);

  // 1. Temperature likely entered as Celsius into a °F field.
  //    Anything <= 40 in a tent °F field is almost certainly °C
  //    (40°F is 4°C — far below any realistic grow-room air temp).
  if (airTempF !== null && airTempF <= 40) {
    warnings.push(
      `Air temp ${airTempF}°F looks like a Celsius value entered into the °F field. ${DOUBLE_CHECK}`,
    );
  }

  // 2. Humidity unusually low or high.
  if (humidity !== null && humidity >= 0 && humidity <= 100) {
    if (humidity < 20) {
      warnings.push(
        `Humidity ${humidity}% is unusually low for a grow tent. ${DOUBLE_CHECK}`,
      );
    } else if (humidity > 90) {
      warnings.push(
        `Humidity ${humidity}% is unusually high for a grow tent. ${DOUBLE_CHECK}`,
      );
    }
  }

  // 3. VPD: unrealistic when entered; derivation hint when absent.
  let derivedVpdKpa: number | null = null;
  const haveTempRh =
    airTempF !== null && humidity !== null && humidity >= 0 && humidity <= 100;
  if (vpd !== null) {
    if (vpd <= 0 || vpd > 3) {
      warnings.push(
        `VPD ${vpd} kPa is outside the realistic 0.4–2.0 kPa grow range. ${DOUBLE_CHECK}`,
      );
    }
  } else if (haveTempRh) {
    derivedVpdKpa = computeVpdKpa(fahrenheitToCelsius(airTempF), humidity);
  }

  // 4. CO2 below 300 ppm or above 2000 ppm.
  if (co2 !== null) {
    if (co2 < 300) {
      warnings.push(
        `CO₂ ${co2} ppm is below ambient (~400 ppm). ${DOUBLE_CHECK}`,
      );
    } else if (co2 > 2000) {
      warnings.push(
        `CO₂ ${co2} ppm is above the safe enrichment ceiling. ${DOUBLE_CHECK}`,
      );
    }
  }

  // 5. Soil moisture stuck at 0% or 100%.
  if (soil !== null && (soil === 0 || soil === 100)) {
    warnings.push(
      `Soil moisture reading is stuck at ${soil}%, which usually means a stuck or unplugged probe. ${DOUBLE_CHECK}`,
    );
  }

  // 6. Soil EC likely entered as µS/cm into a mS/cm field.
  //    Realistic grow-medium EC is ~0.5–3.5 mS/cm. A value >= 50 in a
  //    mS/cm field almost certainly came from a µS/cm reading.
  if (ecMs !== null && ecMs >= 50) {
    warnings.push(
      `Soil EC ${ecMs} looks like it was entered in µS/cm instead of mS/cm. ${DOUBLE_CHECK}`,
    );
  }
  if (ecUs !== null && ecUs > 0 && ecUs < 50) {
    warnings.push(
      `Soil EC ${ecUs} µS/cm looks unusually low — most pens report 500–3500 µS/cm. ${DOUBLE_CHECK}`,
    );
  }

  // 7. Reservoir pH outside realistic 4.5–7.5 range.
  if (ph !== null && (ph < 4.5 || ph > 7.5)) {
    warnings.push(
      `Reservoir pH ${ph} is outside the realistic 4.5–7.5 range. ${DOUBLE_CHECK}`,
    );
  }

  return { warnings, derivedVpdKpa };
}

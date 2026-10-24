/** Physical entry limits, not cultivation recommendations. Blank bounds remain optional. */
import {
  AIR_TEMP_C_RANGE,
  HUMIDITY_RANGE,
  SUBSTRATE_TEMP_C_RANGE,
  VWC_RANGE,
} from "@/constants/csvValidationRanges";
import { VPD_REALISTIC_RANGE } from "@/lib/manualSensorSnapshotQualityRules";
import { EC_MSCM_RANGE, PPFD_RANGE } from "@/lib/sensorReadingRangeValidation";
import {
  celsiusToFahrenheit,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

const RANGES = {
  temp: { ...AIR_TEMP_C_RANGE, unit: "°C" },
  rh: { ...HUMIDITY_RANGE, unit: "%" },
  vpd: { ...VPD_REALISTIC_RANGE, unit: "kPa" },
  soil_wc: { ...VWC_RANGE, unit: "%" },
  soil_ec: { ...EC_MSCM_RANGE, unit: "mS/cm" },
  soil_temp: { ...SUBSTRATE_TEMP_C_RANGE, unit: "°C" },
  ppfd: { ...PPFD_RANGE, unit: "µmol/m²/s" },
} as const;

export type GrowTargetField = keyof typeof RANGES;
export type GrowTargetBound = `${GrowTargetField}_${"min" | "max"}`;

export interface GrowTargetValidation {
  readonly errors: Partial<Record<GrowTargetBound, string>>;
  readonly blocksSave: boolean;
}

/**
 * Validate every entered bound without rounding it into the accepted range.
 * Temperature limits follow the display unit; storage conversion remains in the editor.
 * Empty/absent and one-sided bounds are allowed, as are equal min/max values.
 * Non-empty invalid/non-finite input must never become an optional null bound.
 * Native bad-input flags block even when the browser exposes an empty value.
 */
export function validateGrowTargetForm(
  form: Readonly<Partial<Record<GrowTargetBound, string>>>,
  temperatureUnit: TemperatureUnitPreference,
  badInputs: Readonly<Partial<Record<GrowTargetBound, boolean>>> = {},
): GrowTargetValidation {
  const errors: GrowTargetValidation["errors"] = {};
  for (const field of Object.keys(RANGES) as GrowTargetField[]) {
    const range = RANGES[field];
    const fahrenheit =
      (field === "temp" || field === "soil_temp") && temperatureUnit === "fahrenheit";
    const low = fahrenheit ? celsiusToFahrenheit(range.min) : range.min;
    const high = fahrenheit ? celsiusToFahrenheit(range.max) : range.max;
    const unit = fahrenheit ? "°F" : range.unit;
    const values: Partial<Record<"min" | "max", number>> = {};

    for (const bound of ["min", "max"] as const) {
      const key = `${field}_${bound}` as GrowTargetBound;
      if (badInputs[key]) {
        errors[key] = "Enter a finite number.";
        continue;
      }
      const raw = form[key]?.trim() ?? "";
      if (raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors[key] = "Enter a finite number.";
        continue;
      }
      values[bound] = value;
      if (value < low || value > high) {
        errors[key] = `Must be between ${low} and ${high} ${unit}.`;
      }
    }

    if (values.min !== undefined && values.max !== undefined && values.min > values.max) {
      for (const bound of ["min", "max"] as const) {
        const key = `${field}_${bound}` as GrowTargetBound;
        errors[key] = [errors[key], "Range min must be ≤ max."].filter(Boolean).join(" ");
      }
    }
  }
  return { errors, blocksSave: Object.keys(errors).length > 0 };
}

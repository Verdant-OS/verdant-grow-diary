/**
 * Pure presenter helpers for sensor value precision and derived
 * indicator badging. Used by snapshot cards and chips.
 *
 * Rules:
 *  - VPD: max 2 decimals  → "1.16 kPa"
 *  - EC:  max 2 decimals  → "1.85 mS/cm"
 *  - Temp: 1 decimal      → "24.3 °C"
 *  - RH:  1 decimal       → "55.0 %"
 *  - The "derived" indicator never appended to the value string; it is
 *    returned as a separate label callers may render as a chip.
 *
 * Null-safe. No I/O. No React.
 *
 * Temperature unit policy (#15):
 *  - Verdant's user-facing temperature unit is **Fahrenheit** everywhere
 *    (Tents page, Tent detail header, Recent manual snapshots, snapshot
 *    cards). Storage stays in °C — see `temperatureUnits.ts`.
 *  - `air_temp_c` / `soil_temp_c` values are converted to °F at this
 *    presenter boundary so every surface that consumes
 *    `formatSensorValue` is consistent with the rest of the app and
 *    never shows °F and °C together on the same screen.
 */
import type { SensorFieldKey } from "@/constants/sensorFields";
import { celsiusToFahrenheit } from "@/lib/temperatureUnits";

const UNIT_BY_FIELD: Record<SensorFieldKey, string> = {
  air_temp_c: "°F",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  soil_temp_c: "°F",
  soil_ec_mscm: "mS/cm",
  reservoir_ph: "pH",
  reservoir_ec_mscm: "mS/cm",
  ppfd: "µmol",
};

const DECIMALS_BY_FIELD: Record<SensorFieldKey, number> = {
  air_temp_c: 1,
  humidity_pct: 1,
  vpd_kpa: 2,
  co2_ppm: 0,
  soil_moisture_pct: 1,
  soil_temp_c: 1,
  soil_ec_mscm: 2,
  reservoir_ph: 2,
  reservoir_ec_mscm: 2,
  ppfd: 0,
};

const TEMPERATURE_FIELDS = new Set<SensorFieldKey>(["air_temp_c", "soil_temp_c"]);

export const DERIVED_LABEL = "Derived" as const;

export function sensorFieldUnit(field: SensorFieldKey | string): string {
  return UNIT_BY_FIELD[field as SensorFieldKey] ?? "";
}

export function sensorFieldDecimals(field: SensorFieldKey | string): number {
  const d = DECIMALS_BY_FIELD[field as SensorFieldKey];
  return Number.isFinite(d) ? d : 1;
}

/**
 * Format a sensor value with field-aware precision. Returns "—" for
 * null/undefined/non-finite. Never appends a "derived" marker.
 *
 * Temperature fields (`air_temp_c`, `soil_temp_c`) are converted from
 * the stored Celsius value to user-facing Fahrenheit before formatting.
 */
export function formatSensorValue(
  field: SensorFieldKey | string,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const digits = sensorFieldDecimals(field);
  const unit = sensorFieldUnit(field);
  const display = TEMPERATURE_FIELDS.has(field as SensorFieldKey)
    ? celsiusToFahrenheit(value as number)
    : (value as number);
  const num = display.toFixed(digits);
  return unit ? `${num} ${unit}` : num;
}

export interface FormattedSensorReading {
  value: string;
  unit: string;
  derived: boolean;
  derivedLabel: typeof DERIVED_LABEL | null;
}

export function formatSensorReading(args: {
  field: SensorFieldKey | string;
  value: number | null | undefined;
  derived?: boolean;
}): FormattedSensorReading {
  return {
    value: formatSensorValue(args.field, args.value),
    unit: sensorFieldUnit(args.field),
    derived: args.derived === true,
    derivedLabel: args.derived === true ? DERIVED_LABEL : null,
  };
}

/**
 * App-wide unit constants.
 *
 * - Temperature: data is always stored in canonical Celsius. The display
 *   unit is a presentation choice. Convert only at the display boundary.
 * - EC/PPM: data is canonical mS/cm where the schema accepts it; the
 *   grower picks the unit they entered, never the other way around.
 *
 * Constants-only. No I/O. No React.
 */

export type TempDisplayUnit = "celsius" | "fahrenheit";

export const DEFAULT_TEMP_DISPLAY_UNIT: TempDisplayUnit = "fahrenheit";

export const TEMP_DISPLAY_UNIT_LABEL: Record<TempDisplayUnit, string> = {
  celsius: "°C",
  fahrenheit: "°F",
};

export const EC_UNITS = ["mS/cm", "µS/cm", "PPM-500", "PPM-700"] as const;
export type EcUnit = (typeof EC_UNITS)[number];

export const DEFAULT_EC_UNIT: EcUnit = "mS/cm";

export const EC_UNIT_LABEL: Record<EcUnit, string> = {
  "mS/cm": "mS/cm",
  "µS/cm": "µS/cm",
  "PPM-500": "PPM (×500)",
  "PPM-700": "PPM (×700)",
};

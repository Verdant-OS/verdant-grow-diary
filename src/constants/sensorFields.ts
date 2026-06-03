/**
 * Canonical human-readable labels for sensor metric fields used in
 * Manual Sensor Snapshots and other presenter surfaces.
 *
 * Presenter-only. No I/O, no React. Never invents values; an unknown
 * field key falls back to a Title-Cased, space-separated version of the
 * raw key (never the raw snake_case).
 */

export type SensorFieldKey =
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

export const SENSOR_FIELD_LABELS: Record<SensorFieldKey, string> = {
  air_temp_c: "Air temp",
  humidity_pct: "Humidity",
  vpd_kpa: "VPD",
  co2_ppm: "CO₂",
  soil_moisture_pct: "Soil moisture",
  soil_temp_c: "Soil temp",
  soil_ec_mscm: "Soil EC",
  reservoir_ph: "Reservoir pH",
  reservoir_ec_mscm: "Reservoir EC",
  ppfd: "PPFD",
};

/**
 * Format an arbitrary sensor field key as a human-readable label.
 * Never returns raw snake_case — unknown keys are Title Cased with
 * separators converted to spaces.
 */
export function formatSensorFieldLabel(field: string | null | undefined): string {
  if (!field) return "Unknown";
  const known = SENSOR_FIELD_LABELS[field as SensorFieldKey];
  if (known) return known;
  const cleaned = field.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Unknown";
  return cleaned
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

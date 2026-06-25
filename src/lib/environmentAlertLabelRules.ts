/**
 * environmentAlertLabelRules — pure, deterministic, null-safe helpers
 * for turning internal environment alert enum tokens (e.g. `high_vpd`,
 * `low_humidity`) into grower-friendly labels.
 *
 * Hard constraints:
 *  - No I/O. No React. No Supabase. No writes.
 *  - Never returns an internal enum token verbatim.
 *  - Unknown / missing / malformed inputs collapse to the calm fallback
 *    "Environment alert" so grower-facing copy never leaks an enum slug.
 *  - Never references device-control or automation language.
 */

/** Stable map of known environment alert type slugs to friendly labels. */
const ENVIRONMENT_ALERT_LABELS: Readonly<Record<string, string>> = {
  high_vpd: "High VPD",
  low_vpd: "Low VPD",
  high_temperature: "High temperature",
  low_temperature: "Low temperature",
  high_humidity: "High humidity",
  low_humidity: "Low humidity",
  high_co2: "High CO₂",
  low_co2: "Low CO₂",
  high_ppfd: "High light intensity",
  low_ppfd: "Low light intensity",
  high_dli: "High daily light integral",
  low_dli: "Low daily light integral",
  high_ec: "High nutrient EC",
  low_ec: "Low nutrient EC",
  high_ph: "High pH",
  low_ph: "Low pH",
  high_soil_moisture: "High soil moisture",
  low_soil_moisture: "Low soil moisture",
  high_soil_temperature: "High soil temperature",
  low_soil_temperature: "Low soil temperature",
  high_reservoir_temperature: "High reservoir temperature",
  low_reservoir_temperature: "Low reservoir temperature",
  stale_telemetry: "Stale telemetry",
  invalid_telemetry: "Invalid telemetry",
};

/** Calm fallback. Never expose a raw enum token to growers. */
export const ENVIRONMENT_ALERT_FALLBACK_LABEL = "Environment alert";

/**
 * Map an internal environment alert type slug (e.g. `high_vpd`) to a
 * grower-friendly label. Unknown, missing, or malformed inputs collapse
 * to "Environment alert" so growers never see the raw enum.
 */
export function formatEnvironmentAlertLabel(
  alertType: string | null | undefined,
): string {
  if (typeof alertType !== "string") return ENVIRONMENT_ALERT_FALLBACK_LABEL;
  const key = alertType.trim().toLowerCase();
  if (!key) return ENVIRONMENT_ALERT_FALLBACK_LABEL;
  const known = ENVIRONMENT_ALERT_LABELS[key];
  if (known) return known;
  return ENVIRONMENT_ALERT_FALLBACK_LABEL;
}

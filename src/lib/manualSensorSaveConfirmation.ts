/**
 * manualSensorSaveConfirmation — pure formatters for the post-save UX of
 * the Manual Sensor Reading flow.
 *
 * Hard rules:
 *   - Pure: no I/O, no React, no Supabase, no time, no randomness.
 *   - Source label is always "Manual" — never relabeled.
 *   - Never invents readings. If a metric isn't in the saved list, it
 *     simply isn't shown.
 *   - Error sanitizer never echoes raw error text that looks like a
 *     secret, token, JWT, service-role hint, internal id, or raw payload.
 */

import type { ManualReadingMetric } from "@/lib/sensorReadingManualEntryRules";

const FAHRENHEIT_FROM_C = (c: number): number =>
  Math.round((c * 9) / 5 + 32 + Number.EPSILON);

/** Stable order for the success line. */
const METRIC_DISPLAY_ORDER: ReadonlyArray<ManualReadingMetric["metric"]> = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "ppfd",
];

function formatMetricChip(m: ManualReadingMetric): string | null {
  if (!Number.isFinite(m.value)) return null;
  switch (m.metric) {
    case "temperature_c": {
      const f = FAHRENHEIT_FROM_C(m.value);
      return `${f}°F`;
    }
    case "humidity_pct":
      return `${Math.round(m.value)}% RH`;
    case "vpd_kpa":
      return `${m.value.toFixed(2)} kPa VPD`;
    case "co2_ppm":
      return `${Math.round(m.value)} ppm CO₂`;
    case "soil_moisture_pct":
      return `${Math.round(m.value)}% soil`;
    case "ppfd":
      return `${Math.round(m.value)} PPFD`;
    default:
      return null;
  }
}

/**
 * Build a short, operator-friendly success line summarizing the saved
 * manual snapshot. Example:
 *   "Manual snapshot saved: 78°F · 61% RH. Source: Manual."
 */
export function buildManualSaveSuccessLine(args: {
  metrics: ReadonlyArray<ManualReadingMetric>;
}): string {
  const ordered = [...args.metrics].sort(
    (a, b) =>
      METRIC_DISPLAY_ORDER.indexOf(a.metric) -
      METRIC_DISPLAY_ORDER.indexOf(b.metric),
  );
  const chips = ordered
    .map(formatMetricChip)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  const head = chips.length > 0 ? chips.join(" · ") : "(no metrics)";
  return `Manual snapshot saved: ${head}. Source: Manual.`;
}

const SECRET_HINTS: RegExp[] = [
  /bearer\b/i,
  /authorization/i,
  /service[_-]?role/i,
  /SUPABASE_/,
  /jwt/i,
  /token/i,
  /\bsb_[A-Za-z0-9_-]{8,}/,
  /eyJ[A-Za-z0-9_-]{10,}\./, // JWT-shaped
  /password/i,
  /api[_-]?key/i,
];

/**
 * Map a thrown error from the manual save path into a safe, operator-facing
 * message. Never leaks secrets, internal IDs, or raw payloads.
 */
export function mapManualSaveErrorToUserMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const trimmed = raw.replace(/[\r\n]+/g, " ").trim();
  if (!trimmed) {
    return "Manual snapshot could not be saved. Check required fields and try again.";
  }
  if (SECRET_HINTS.some((re) => re.test(trimmed))) {
    return "Manual snapshot could not be saved. Please try again or sign in again.";
  }
  // Known short, user-safe messages from upstream validators are fine.
  if (trimmed.length <= 160 && /^[\x20-\x7E°µ²·–—…]+$/.test(trimmed)) {
    return trimmed;
  }
  return "Manual snapshot could not be saved. Check required fields and try again.";
}

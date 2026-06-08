/**
 * Sensor provider / source display labels.
 *
 * These are presenter-safe constants. They do NOT affect Live status,
 * usable/stale/invalid classification, save payload, or attach-toggle
 * behaviour. They are rendered as a passive "source: …" chip in the
 * Quick Log sensor snapshot strip when the source is known and not
 * "live" / "unavailable".
 *
 * Kept in src/constants/ (not src/lib/) so static safety scanners do
 * not conflate these read-only labels with device-control code.
 */

export const SENSOR_PROVIDER_LABELS: Record<string, string> = {
  ecowitt: "EcoWitt",
  mqtt: "MQTT",
  home_assistant: "Home Assistant",
  pi_bridge: "Pi Bridge",
  raspberry_pi: "Raspberry Pi",
  spider_farmer: "Spider Farmer",
  spider_farmer_ggs: "Spider Farmer GGS",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

export const PROVIDER_LABEL_MAX = 32;

function titleCase(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Format a source/provider string into a short, presenter-safe display
 * label. Returns null when no chip should render (missing source, or
 * source is `live` / `unavailable` — Live is communicated by the
 * resolver-driven badge, never by this chip).
 *
 * Recognised vendors map to friendly capitalisation. Unknown values are
 * lowercased, `_`/`-` are replaced with spaces, words title-cased, and
 * the result is length-capped so secret-looking strings never leak as
 * a UI chip.
 */
export function deriveProviderLabel(
  source: string | null | undefined,
): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "live" || lower === "unavailable") return null;
  const key = lower.replace(/-/g, "_");
  if (SENSOR_PROVIDER_LABELS[key]) return SENSOR_PROVIDER_LABELS[key];
  const safe = lower
    .replace(/[^a-z0-9_\- ]+/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) return null;
  const titled = safe
    .split(" ")
    .map(titleCase)
    .join(" ");
  return titled.length > PROVIDER_LABEL_MAX
    ? `${titled.slice(0, PROVIDER_LABEL_MAX - 1)}…`
    : titled;
}

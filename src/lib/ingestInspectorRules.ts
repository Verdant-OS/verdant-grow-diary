/**
 * Ingest Inspector — pure helpers for the read-only sensor webhook
 * inspector surface.
 *
 * Hard constraints:
 *  - Pure. No I/O. No React. No Supabase. No timers.
 *  - Read-only support. Never produces a write payload.
 *  - Redacts obvious secret-like keys/values before display.
 *  - Never promotes csv/webhook/mqtt/ecowitt/etc. to a "Live" label.
 *  - Never reveals user_id.
 */

export const INGEST_INSPECTOR_DISCLOSURE_LINES = [
  "Read-only inspector.",
  "No device control.",
  "No data is modified from this screen.",
] as const;

/** Hard-coded ceiling on rows fetched per query (defense in depth). */
export const INGEST_INSPECTOR_MAX_ROWS = 200;

/** Sliding window for "recent" readings, in milliseconds. */
export const INGEST_INSPECTOR_DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Raw DB `sensor_readings.source` values are stored lower-case. A
 * value of `"live"` is NOT in the DB allow-list — webhook bridge
 * sources are explicit transports (csv, webhook, mqtt, ecowitt, etc.)
 * and must never be re-labeled "Live".
 */
const NON_LIVE_TRANSPORT_SOURCES = new Set<string>([
  "csv",
  "webhook",
  "webhook_generic",
  "mqtt",
  "ecowitt",
  "manual",
  "demo",
  "stale",
  "invalid",
  "sim",
  "pi_bridge",
  "node_red_bridge",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
  "home_assistant_bridge",
  "ha_forwarded",
]);

const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  csv: "CSV",
  mqtt: "MQTT",
  ecowitt: "EcoWitt",
  webhook: "Webhook",
  webhook_generic: "Webhook",
  pi_bridge: "Pi Bridge",
  home_assistant_bridge: "Home Assistant",
  ha_forwarded: "Home Assistant",
  node_red_bridge: "Node-RED",
  esp32_arduino: "ESP32",
  esp32_arduino_sht31: "ESP32 (SHT31)",
  esp32_esphome: "ESP32 (ESPHome)",
  esp32_mqtt_bridge: "ESP32 (MQTT)",
  manual: "Manual",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  sim: "Sim",
};

/** Display label for a raw DB source value. Never returns "Live". */
export function inspectorSourceLabel(
  source: string | null | undefined,
): string {
  if (typeof source !== "string" || source.trim() === "") return "Unknown";
  const key = source.trim().toLowerCase();
  return SOURCE_LABEL_OVERRIDES[key] ?? key;
}

/** True if a raw source string would be safely treated as "live" telemetry. */
export function isLiveSource(source: string | null | undefined): boolean {
  if (typeof source !== "string") return false;
  const key = source.trim().toLowerCase();
  if (key === "") return false;
  // Hard rule: CSV / webhook / MQTT / Ecowitt / manual / demo /
  // stale / invalid never count as live.
  return !NON_LIVE_TRANSPORT_SOURCES.has(key);
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Case-insensitive key patterns that must be redacted before display. */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /authorization/i,
  /api[-_ ]?key/i,
  /bearer/i,
  /signature/i,
  /private[-_ ]?key/i,
  /access[-_ ]?key/i,
  /^auth$/i,
  /cookie/i,
  /session[-_ ]?id/i,
];

/** Top-level keys we always strip from display. user_id leaks PII. */
const ALWAYS_STRIP_KEYS = new Set(["user_id", "userid", "uid"]);

export const REDACTED_PLACEHOLDER = "[REDACTED]";

function isSecretKey(key: string): boolean {
  if (ALWAYS_STRIP_KEYS.has(key.toLowerCase())) return true;
  return SECRET_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Deep-redact secret-like keys in a JSON-ish payload before display.
 * Returns a new value — never mutates input.
 * Arrays and nested objects are walked; depth is bounded.
 */
export function redactRawPayload(input: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED_PLACEHOLDER;
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((v) => redactRawPayload(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = REDACTED_PLACEHOLDER;
      } else {
        out[k] = redactRawPayload(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

// ---------------------------------------------------------------------------
// Vendor lineage (lineage-only, NEVER used for auth/routing)
// ---------------------------------------------------------------------------

/**
 * Extract a vendor lineage string from raw_payload, if present. Vendor
 * is presentation-only — never trusted for ownership, auth, or routing.
 */
export function extractVendorLineage(
  rawPayload: unknown,
): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const obj = rawPayload as Record<string, unknown>;
  const v = obj.vendor;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  const meta = obj.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const mv = (meta as Record<string, unknown>).vendor;
    if (typeof mv === "string" && mv.trim().length > 0) return mv.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface InspectorReadingLike {
  id: string;
  ts: string;
  captured_at: string | null;
  source: string;
  metric: string;
  value: number | null;
  quality: string | null;
  tent_id: string | null;
  device_id: string | null;
  raw_payload: unknown;
}

export interface InspectorFilters {
  source?: string | null;
  vendor?: string | null;
  tentId?: string | null;
}

export function filterInspectorReadings(
  rows: readonly InspectorReadingLike[],
  filters: InspectorFilters,
): InspectorReadingLike[] {
  const src = filters.source?.trim().toLowerCase() || null;
  const vendor = filters.vendor?.trim().toLowerCase() || null;
  const tentId = filters.tentId?.trim() || null;
  return rows.filter((r) => {
    if (src && r.source.toLowerCase() !== src) return false;
    if (tentId && r.tent_id !== tentId) return false;
    if (vendor) {
      const v = extractVendorLineage(r.raw_payload);
      if (!v || v.toLowerCase() !== vendor) return false;
    }
    return true;
  });
}

/** Unit hint per known metric. Display only — no validation. */
export const METRIC_UNIT: Record<string, string> = {
  temperature_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  ph: "pH",
  ec: "mS/cm",
  ppfd: "µmol/m²/s",
};

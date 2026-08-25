/**
 * ecowittCustomHttpBridgeIngestRules — pure mirror of the custom-HTTP EcoWitt
 * bridge FIELD_MAP + constitution Sensor Truth helpers used by
 * `tools/ecowitt-testbench/ecowitt_listener.py`.
 *
 * Locked ingest path (do not replace):
 *   EcoWitt Customized Upload (protocol Ecowitt, never WU)
 *     → tools/ecowitt-testbench :8787/ecowitt
 *     → sensor-ingest-webhook only
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no timers, no device control, no WU / MQTT /
 *    cloud poller, no EcoWitt set_* / reboot / calibration.
 *  - Keep existing FIELD_MAP names; accept extra grow channels onto those
 *    same canonical metric names. Do not invent columns.
 *  - leafwetness* / tf_ch* / WH52 EC → raw_payload only (unless an existing
 *    metric name already exists — none today).
 *  - Unknown keys stay in metadata.raw_payload. PASSKEY must be redacted.
 *  - Missing/unparseable → null. Stuck RH/soil 0 or 100 → invalid.
 *  - Constitution tags only: live | manual | csv | demo | stale | invalid.
 *  - Never store/display/promote ecowitt, ha, mqtt, esp32, webhook, sim.
 */

/** Canonical metric names already accepted by the webhook normalizer. */
export type EcowittCustomHttpCanonicalMetric =
  | "temp_f"
  | "humidity_percent"
  | "soil_moisture_pct"
  | "co2_ppm";

/**
 * Existing FIELD_MAP, then extra grow channels accepted onto the same names.
 * First present, parseable candidate wins (same as the Python listener).
 */
export const ECOWITT_CUSTOM_HTTP_FIELD_MAP: Readonly<
  Record<EcowittCustomHttpCanonicalMetric, readonly string[]>
> = {
  temp_f: [
    "temp1f",
    "tempf",
    "tempinf",
    "temp2f",
    "temp3f",
    "temp4f",
    "temp5f",
    "temp6f",
    "temp7f",
    "temp8f",
  ],
  humidity_percent: [
    "humidity1",
    "humidity",
    "humidityin",
    "humidity2",
    "humidity3",
    "humidity4",
    "humidity5",
    "humidity6",
    "humidity7",
    "humidity8",
  ],
  soil_moisture_pct: [
    "soilmoisture1",
    "soilmoisture2",
    "soilmoisture3",
    "soilmoisture4",
    "soilmoisture5",
    "soilmoisture6",
    "soilmoisture7",
    "soilmoisture8",
    "soilmoisture9",
    "soilmoisture10",
    "soilmoisture11",
    "soilmoisture12",
    "soilmoisture13",
    "soilmoisture14",
    "soilmoisture15",
    "soilmoisture16",
  ],
  co2_ppm: ["co2", "co2in", "co2_ppm"],
} as const;

/** Constitution Sensor Truth labels for the custom-HTTP bridge. */
export const ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type EcowittCustomHttpConstitutionSource =
  (typeof ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES)[number];

/** Transport / vendor tokens that must never be Sensor Truth. */
export const ECOWITT_CUSTOM_HTTP_FORBIDDEN_SOURCE_TOKENS = [
  "ecowitt",
  "ha",
  "homeassistant",
  "home_assistant",
  "mqtt",
  "esp32",
  "webhook",
  "sim",
] as const;

/** Live freshness window — constitution: dateutc ≤ 15 min → live. */
export const ECOWITT_CUSTOM_HTTP_LIVE_FRESHNESS_MS = 15 * 60 * 1000;

/** Keys that stay in raw_payload only (never promoted to canonical metrics). */
export const ECOWITT_CUSTOM_HTTP_RAW_PAYLOAD_ONLY_KEY_RE =
  /^(leafwetness\d*|tf_ch\d+|soilad\d*|ec\d*|soil_ec\d*)$/i;

const PASSKEY_REDACT_KEYS = new Set(["passkey", "mac"]);

function coerceFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function payloadKeyLookup(
  payload: Record<string, unknown>,
  wanted: string,
): unknown {
  const lower = wanted.toLowerCase();
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Map known EcoWitt grow channels onto canonical webhook metric names.
 * Missing / unparseable candidates become null — never healthy defaults.
 */
export function normalizeEcowittCustomHttpMetrics(
  payload: Record<string, unknown> | null | undefined,
): Record<EcowittCustomHttpCanonicalMetric, number | null> {
  const out: Record<EcowittCustomHttpCanonicalMetric, number | null> = {
    temp_f: null,
    humidity_percent: null,
    soil_moisture_pct: null,
    co2_ppm: null,
  };
  if (!payload || typeof payload !== "object") return out;

  for (const [canonical, candidates] of Object.entries(ECOWITT_CUSTOM_HTTP_FIELD_MAP) as Array<
    [EcowittCustomHttpCanonicalMetric, readonly string[]]
  >) {
    let value: number | null = null;
    for (const key of candidates) {
      const raw = payloadKeyLookup(payload, key);
      if (raw === undefined) continue;
      value = coerceFinite(raw);
      if (value !== null) break;
    }
    out[canonical] = value;
  }
  return out;
}

/** True when RH or soil moisture is stuck at the impossible healthy extremes. */
export function isEcowittCustomHttpStuckPct(value: number | null | undefined): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return value === 0 || value === 100;
}

/**
 * Stuck humidity/soil at 0 or 100 must not remain healthy live/demo/stale.
 * Returns constitution `invalid` when stuck metrics are present.
 */
export function applyEcowittCustomHttpStuckInvalid(
  source: EcowittCustomHttpConstitutionSource,
  metrics: Record<EcowittCustomHttpCanonicalMetric, number | null>,
): EcowittCustomHttpConstitutionSource {
  if (
    isEcowittCustomHttpStuckPct(metrics.humidity_percent) ||
    isEcowittCustomHttpStuckPct(metrics.soil_moisture_pct)
  ) {
    return "invalid";
  }
  return source;
}

export function isEcowittCustomHttpForbiddenSourceToken(source: unknown): boolean {
  if (typeof source !== "string") return false;
  const src = source.trim().toLowerCase();
  return (ECOWITT_CUSTOM_HTTP_FORBIDDEN_SOURCE_TOKENS as readonly string[]).includes(src);
}

export function isEcowittCustomHttpConstitutionSource(
  value: unknown,
): value is EcowittCustomHttpConstitutionSource {
  return (
    typeof value === "string" &&
    (ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * Redact PASSKEY-class secrets from a raw EcoWitt payload copy.
 * Unknown keys (including leafwetness* / tf_ch*) are preserved.
 */
export function redactEcowittCustomHttpRawPayload(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (PASSKEY_REDACT_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Keys present in the payload that are intentionally raw_payload-only
 * (leafwetness / tf_ch / soil EC-like). Never mapped onto canonical metrics.
 */
export function listEcowittCustomHttpRawPayloadOnlyKeys(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.keys(payload)
    .filter((k) => ECOWITT_CUSTOM_HTTP_RAW_PAYLOAD_ONLY_KEY_RE.test(k))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Extra grow-channel keys that FIELD_MAP accepts onto canonical names
 * beyond the original ch1/indoor/soil1-2/co2 set.
 */
export function listEcowittCustomHttpExtraChannelKeysAccepted(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  if (!payload || typeof payload !== "object") return [];
  const extra = new Set<string>([
    "temp2f",
    "temp3f",
    "temp4f",
    "temp5f",
    "temp6f",
    "temp7f",
    "temp8f",
    "humidity2",
    "humidity3",
    "humidity4",
    "humidity5",
    "humidity6",
    "humidity7",
    "humidity8",
    "soilmoisture3",
    "soilmoisture4",
    "soilmoisture5",
    "soilmoisture6",
    "soilmoisture7",
    "soilmoisture8",
    "soilmoisture9",
    "soilmoisture10",
    "soilmoisture11",
    "soilmoisture12",
    "soilmoisture13",
    "soilmoisture14",
    "soilmoisture15",
    "soilmoisture16",
  ]);
  return Object.keys(payload)
    .filter((k) => extra.has(k.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

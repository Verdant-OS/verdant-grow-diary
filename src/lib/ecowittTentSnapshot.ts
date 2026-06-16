// Shared canonical EcoWitt tent snapshot type. Pure types + helpers, no I/O.
// Used by Flower/Seedling/Vegetation normalizers and the tent normalizer router.

export const ECOWITT_PROVIDER = "ecowitt" as const;
export type EcowittProvider = typeof ECOWITT_PROVIDER;

export type EcowittSnapshotSource = "live" | "degraded" | "invalid";
export type RootZoneConfidence = "complete" | "partial" | "missing";

export interface EcowittTentMetrics {
  air_temp_f: number | null;
  humidity_pct: number | null;
  soil_temp_f: number | null;
  soil_moisture_pct_primary: number | null;
  soil_moisture_pct_secondary: number | null;
}

export interface CanonicalEcowittTentSnapshot {
  source: EcowittSnapshotSource;
  provider: EcowittProvider;
  tent_label: string;
  captured_at: string | null; // ISO 8601 or null
  metrics: EcowittTentMetrics;
  channel_map: Readonly<Record<string, string>>;
  root_zone_confidence: RootZoneConfidence;
  degraded_reasons: readonly string[];
  invalid_reasons: readonly string[];
  /** Raw payload preserved internally. Do NOT render raw payload in UI without redaction. */
  raw_payload: Readonly<Record<string, unknown>>;
  raw_payload_preserved: true;
}

export interface EcowittNormalizeOptions {
  now?: Date;
  captured_at_ms?: number | null;
  max_age_ms?: number;
}

export const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function inRangeOrNull(n: number | null, min: number, max: number): number | null {
  if (n === null) return null;
  return n >= min && n <= max ? n : null;
}

/** Fields that must NEVER be rendered in UI — secrets, identifiers, network. */
export const ECOWITT_PRIVATE_FIELDS: readonly string[] = [
  "PASSKEY",
  "passkey",
  "MAC",
  "mac",
  "stationtype",
  "station_id",
  "stationId",
  "deviceId",
  "device_id",
  "imei",
  "token",
  "Authorization",
  "authorization",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "ip",
  "private_ip",
  "remote_ip",
  "client_ip",
];

export function redactEcowittPayload(
  raw: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ECOWITT_PRIVATE_FIELDS.includes(k)) continue;
    // Conservative: also drop anything that even loosely looks private.
    const lk = k.toLowerCase();
    if (
      lk.includes("passkey") ||
      lk.includes("token") ||
      lk.includes("secret") ||
      lk.includes("password") ||
      lk === "mac" ||
      lk.endsWith("_mac") ||
      lk.includes("station") ||
      lk.includes("apikey") ||
      lk.includes("api_key") ||
      lk.includes("ip")
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

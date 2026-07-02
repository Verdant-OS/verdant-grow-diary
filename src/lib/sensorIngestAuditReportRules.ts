/**
 * sensorIngestAuditReportRules — pure rules to render the last N accepted
 * sensor readings into an auditor-friendly row shape.
 *
 * Hard constraints:
 *   - Pure. No I/O. No Supabase. No React.
 *   - Read-only. Does not invent rejected ingest history if not persisted.
 *   - Source must remain one of: live | manual | csv | demo | stale | invalid.
 *     EcoWitt belongs in `provider`, NEVER as a canonical `source`.
 *   - VPD missing stays null/blank — NEVER 0.
 *   - Raw payload preview must be redacted before display.
 */

export const AUDIT_REPORT_PAGE_SIZES = [10, 25, 50] as const;
export type AuditReportPageSize = typeof AUDIT_REPORT_PAGE_SIZES[number];
export const AUDIT_REPORT_DEFAULT_PAGE_SIZE: AuditReportPageSize = 25;

export const REJECTED_NOT_PERSISTED_NOTE =
  "Rejected ingest attempts are not persisted in this report." as const;

export const CANONICAL_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;
export type CanonicalSource = typeof CANONICAL_SOURCES[number];

export interface RawSensorReadingRow {
  id?: string | null;
  ts?: string | null;
  captured_at?: string | null;
  metric?: string | null;
  value?: number | null;
  quality?: string | null;
  source?: string | null;
  tent_id?: string | null;
  device_id?: string | null;
  raw_payload?: unknown;
}

export interface SensorIngestAuditRow {
  id: string;
  capturedAt: string | null;
  acceptedAtMs: number | null;
  accepted: boolean;
  reason: string;
  source: CanonicalSource | "unknown";
  provider: string | null;
  transport: string | null;
  tentId: string | null;
  plantId: string | null;
  metricSummary: string;
  vpdKpa: number | null;
  soilMoisturePct: number | null;
  humidityPct: number | null;
  airTemperatureC: number | null;
  freshness: "fresh" | "stale" | "unknown";
  confidence: number | null;
  rawPayloadRedacted: string;
  /** Safe/redacted device or station display ID; null when unsafe/missing. */
  deviceStationDisplayId: string | null;
}

export interface AuditReportFilters {
  /** Provider key (e.g. "ecowitt"). "all" or undefined = no filter. */
  provider?: string | "all" | null;
  /** ISO captured_at range (local-only filter). */
  capturedFromIso?: string | null;
  capturedToIso?: string | null;
  /**
   * Free-text search over the safe/redacted device/station display ID
   * ONLY. Never against raw payload secrets.
   */
  deviceStationQuery?: string | null;
}

export interface AuditReportInput {
  rows: RawSensorReadingRow[];
  pageSize?: AuditReportPageSize;
  now?: Date;
  staleMs?: number;
  filters?: AuditReportFilters;
}

export interface AuditReport {
  rows: SensorIngestAuditRow[];
  pageSize: AuditReportPageSize;
  note: typeof REJECTED_NOT_PERSISTED_NOTE;
  /** Distinct provider keys observed in the supplied rows (lowercased). */
  availableProviders: string[];
  /** Total rows after filtering, before last-N slicing. */
  filteredTotal: number;
}

const DEFAULT_STALE_MS = 15 * 60 * 1000;

const REDACT_KEYS = new Set([
  "passkey",
  "pass_key",
  "password",
  "secret",
  "token",
  "authorization",
  "auth",
  "apikey",
  "api_key",
  "bridge_token",
  "verdant_bridge_token",
  "stationid",
  "station_id",
  "mac",
  "ip",
  "ipaddress",
  "ip_address",
]);

/**
 * Heuristics for "this looks like a secret value we cannot confidently
 * redact". If any such value appears in a *non*-redacted key, the safe
 * preview should be hidden entirely.
 */
const SUSPICIOUS_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{8,}/i,
  /\b[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}\b/,
  /\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{16,}/,
];

export interface SafeRawPayloadPreview {
  safe: boolean;
  preview: string | null;
  reason: string;
}

export const RAW_PAYLOAD_HIDDEN_COPY =
  "Raw payload hidden because it may contain sensitive values." as const;
export const RAW_PAYLOAD_SAFE_NOTE =
  "Redacted preview — sensitive keys removed." as const;

export function redactPayload(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const walked = walk(value, seen);
    return JSON.stringify(walked).slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}

export function buildSafeRawPayloadPreview(value: unknown): SafeRawPayloadPreview {
  if (value === null || value === undefined) {
    return { safe: false, preview: null, reason: "No raw payload available." };
  }
  const redacted = redactPayload(value);
  for (const re of SUSPICIOUS_VALUE_PATTERNS) {
    if (re.test(redacted)) {
      return { safe: false, preview: null, reason: RAW_PAYLOAD_HIDDEN_COPY };
    }
  }
  return { safe: true, preview: redacted, reason: RAW_PAYLOAD_SAFE_NOTE };
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => walk(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = walk(v, seen);
    }
  }
  return out;
}

function canonicalizeSource(s: string | null | undefined): CanonicalSource | "unknown" {
  if (!s) return "unknown";
  const v = s.toLowerCase();
  return (CANONICAL_SOURCES as readonly string[]).includes(v) ? (v as CanonicalSource) : "unknown";
}

function readMetaString(payload: unknown, ...keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const meta = p.metadata;
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    for (const k of keys) {
      const v = m[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function readMetaNumber(payload: unknown, ...keys: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  const metrics = p.metrics;
  if (metrics && typeof metrics === "object") {
    const m = metrics as Record<string, unknown>;
    for (const k of keys) {
      const v = m[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

function freshnessOf(capturedAt: string | null, now: Date, staleMs: number): "fresh" | "stale" | "unknown" {
  if (!capturedAt) return "unknown";
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return "unknown";
  const age = now.getTime() - t;
  return age <= staleMs ? "fresh" : "stale";
}

/**
 * Heuristic: refuse any display-id candidate that *looks* like
 * MAC / IP / hex token / JWT / bearer / passkey. Caps length so a
 * surprise value cannot leak via a chip.
 */
const DEVICE_DISPLAY_MAX = 32;
const UNSAFE_DEVICE_PATTERNS: RegExp[] = [
  /\b[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}\b/,
  /\b\d{1,3}(\.\d{1,3}){3}\b/,
  /^[A-Fa-f0-9]{16,}$/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/,
  /Bearer\s+/i,
  /passkey/i,
];

export function deriveSafeDeviceDisplayId(rawPayload: unknown): string | null {
  const candidates = [
    readMetaString(rawPayload, "device_name", "deviceName"),
    readMetaString(rawPayload, "station_name", "stationName"),
    readMetaString(rawPayload, "display_id", "displayId"),
    readMetaString(rawPayload, "model"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (UNSAFE_DEVICE_PATTERNS.some((re) => re.test(trimmed))) continue;
    // Whitelist plain printable label chars only.
    const safe = trimmed.replace(/[^\w .-]+/g, "").trim();
    if (!safe) continue;
    return safe.length > DEVICE_DISPLAY_MAX
      ? `${safe.slice(0, DEVICE_DISPLAY_MAX - 1)}…`
      : safe;
  }
  return null;
}

function timestampMs(s: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function inRange(ms: number | null, fromMs: number | null, toMs: number | null): boolean {
  if (fromMs !== null) {
    if (ms === null) return false;
    if (ms < fromMs) return false;
  }
  if (toMs !== null) {
    if (ms === null) return false;
    if (ms > toMs) return false;
  }
  return true;
}

function rowMatchesFilters(row: SensorIngestAuditRow, f: AuditReportFilters): boolean {
  if (f.provider && f.provider !== "all") {
    const want = f.provider.toLowerCase();
    const have = (row.provider ?? "").toLowerCase();
    const matchUnknown = want === "unknown" && !row.provider;
    if (!matchUnknown && have !== want) return false;
  }
  const fromMs = timestampMs(f.capturedFromIso ?? null);
  const toMs = timestampMs(f.capturedToIso ?? null);
  if ((fromMs !== null || toMs !== null) && !inRange(row.acceptedAtMs, fromMs, toMs)) {
    return false;
  }
  if (f.deviceStationQuery && f.deviceStationQuery.trim()) {
    const q = f.deviceStationQuery.trim().toLowerCase();
    const display = (row.deviceStationDisplayId ?? "").toLowerCase();
    if (!display.includes(q)) return false;
  }
  return true;
}

function projectRow(r: RawSensorReadingRow, idx: number, now: Date, staleMs: number): SensorIngestAuditRow {
  const capturedAt = r.captured_at ?? r.ts ?? null;
  const source = canonicalizeSource(r.source);
  const provider = readMetaString(r.raw_payload, "provider", "vendor");
  const transport = readMetaString(r.raw_payload, "transport");
  const plantId = readMetaString(r.raw_payload, "plant_id");
  const vpd = readMetaNumber(r.raw_payload, "vpd_kpa");
  const soil = readMetaNumber(r.raw_payload, "soil_moisture_pct");
  const humidity = readMetaNumber(r.raw_payload, "humidity_pct", "humidity", "rh", "rh_percent");
  const tempC = readMetaNumber(r.raw_payload, "air_temperature_c", "temperature_c", "temp_c", "tempC");
  const value = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
  const metricSummary = r.metric && value !== null ? `${r.metric}=${value}` : r.metric ?? "—";
  const confidence = readMetaNumber(r.raw_payload, "confidence");

  return {
    id: r.id ?? `row-${idx}`,
    capturedAt,
    acceptedAtMs: timestampMs(capturedAt),
    accepted: true,
    reason: "Persisted accepted reading",
    source,
    provider: provider ? provider.toLowerCase() : null,
    transport,
    tentId: r.tent_id ?? null,
    plantId,
    metricSummary,
    vpdKpa: vpd === 0 ? null : vpd,
    soilMoisturePct: soil,
    humidityPct: humidity,
    airTemperatureC: tempC,
    freshness: freshnessOf(capturedAt, now, staleMs),
    confidence,
    rawPayloadRedacted: redactPayload(r.raw_payload),
    deviceStationDisplayId: deriveSafeDeviceDisplayId(r.raw_payload),
  };
}

export function buildAuditReport(input: AuditReportInput): AuditReport {
  const pageSize = input.pageSize ?? AUDIT_REPORT_DEFAULT_PAGE_SIZE;
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? DEFAULT_STALE_MS;
  const filters = input.filters ?? {};

  const projected = input.rows.map((r, idx) => projectRow(r, idx, now, staleMs));
  const providerSet = new Set<string>();
  let hasMissingProvider = false;
  for (const p of projected) {
    if (p.provider) providerSet.add(p.provider);
    else hasMissingProvider = true;
  }
  const availableProviders = [...providerSet].sort();
  if (hasMissingProvider) availableProviders.push("unknown");

  const filtered = projected.filter((r) => rowMatchesFilters(r, filters));
  const sorted = [...filtered].sort((a, b) => {
    const ta = a.acceptedAtMs;
    const tb = b.acceptedAtMs;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
  const rows = sorted.slice(0, pageSize);

  return {
    rows,
    pageSize,
    note: REJECTED_NOT_PERSISTED_NOTE,
    availableProviders,
    filteredTotal: sorted.length,
  };
}

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

export function buildAuditReport(input: AuditReportInput): AuditReport {
  const pageSize = input.pageSize ?? AUDIT_REPORT_DEFAULT_PAGE_SIZE;
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? DEFAULT_STALE_MS;

  const sorted = [...input.rows].sort((a, b) => {
    const ta = Date.parse(a.captured_at ?? a.ts ?? "");
    const tb = Date.parse(b.captured_at ?? b.ts ?? "");
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return tb - ta;
  });

  const rows: SensorIngestAuditRow[] = sorted.slice(0, pageSize).map((r, idx) => {
    const capturedAt = r.captured_at ?? r.ts ?? null;
    const source = canonicalizeSource(r.source);
    const provider = readMetaString(r.raw_payload, "provider", "vendor");
    const transport = readMetaString(r.raw_payload, "transport");
    const plantId = readMetaString(r.raw_payload, "plant_id");
    const vpd = readMetaNumber(r.raw_payload, "vpd_kpa");
    const soil = readMetaNumber(r.raw_payload, "soil_moisture_pct");
    const value = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
    const metricSummary = r.metric && value !== null ? `${r.metric}=${value}` : r.metric ?? "—";
    const confidence = readMetaNumber(r.raw_payload, "confidence");

    return {
      id: r.id ?? `row-${idx}`,
      capturedAt,
      accepted: true,
      reason: "Persisted accepted reading",
      source,
      provider,
      transport,
      tentId: r.tent_id ?? null,
      plantId,
      metricSummary,
      vpdKpa: vpd === 0 ? null : vpd,
      soilMoisturePct: soil,
      freshness: freshnessOf(capturedAt, now, staleMs),
      confidence,
      rawPayloadRedacted: redactPayload(r.raw_payload),
    };
  });

  return { rows, pageSize, note: REJECTED_NOT_PERSISTED_NOTE };
}

/**
 * V1 Sensor Integration — pure normalization & validation helper for the
 * generic authenticated webhook (`sensor-ingest-webhook` Edge Function).
 *
 * Sensor ingest is read-only. Incoming readings are source-tagged and never
 * trigger AI, alerts, Action Queue, automation, or device control directly.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks.
 *  - Never trust caller-supplied user_id (caller strips it before invoking).
 *  - Never defaults `source` to "live".
 *  - Empty / missing metric values are OMITTED — never persisted as 0.
 *  - Out-of-range values are rejected (helper returns errors); caller decides
 *    whether to reject the whole payload or quarantine.
 *  - Stores the raw payload verbatim; never consults raw_payload for
 *    downstream logic.
 */

import type { TablesInsert } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Allow-lists (mirror the public.validate_sensor_reading trigger)
// ---------------------------------------------------------------------------

export const WEBHOOK_ALLOWED_SOURCES = [
  // Historical / device-specific labels (preserved for back-compat).
  "webhook_generic",
  "pi_bridge",
  "node_red_bridge",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
  "home_assistant_bridge",
  "ha_forwarded",
  // Contract-aligned generic transport labels (V1.1+). Vendor lineage
  // (e.g. EcoWitt, Home Assistant) travels in optional `vendor` /
  // `metadata.vendor` and is preserved only in raw_payload — never trusted
  // for ownership, auth, or routing.
  "ecowitt",
  "mqtt",
  "csv",
  "webhook",
] as const;

export type WebhookSource = (typeof WEBHOOK_ALLOWED_SOURCES)[number];

export function isWebhookSource(s: unknown): s is WebhookSource {
  return (
    typeof s === "string" &&
    (WEBHOOK_ALLOWED_SOURCES as readonly string[]).includes(s)
  );
}

/**
 * Normalize a caller-supplied `source` to its canonical allow-listed form.
 *
 * Rules (hardened, per sensor-truth contract):
 *  - Trim leading/trailing whitespace.
 *  - Lower-case the entire value before comparison.
 *  - Only EXACT matches to the allow-list pass; partial / fuzzy values
 *    (`"eco"`, `"mq"`, `"web"`) are rejected.
 *  - Empty or whitespace-only strings return `null`.
 *  - Returns `null` when input is not a non-empty string or when the
 *    normalized value is not allow-listed — the caller surfaces an
 *    `invalid source` error.
 *
 * The DB allow-list (`public.validate_sensor_reading`) already accepts the
 * canonical lower-case values, so callers MUST persist the canonical form
 * returned by this helper, not the raw input.
 */
export function normalizeWebhookSource(s: unknown): WebhookSource | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  return isWebhookSource(lower) ? (lower as WebhookSource) : null;
}

/**
 * Normalize a caller-supplied vendor lineage tag.
 *
 * Vendor is **lineage only**. It MUST NEVER influence auth, ownership,
 * routing, permissions, `source`, `user_id`, or `tent_id`. This helper:
 *  - Trims whitespace.
 *  - Drops empty / whitespace-only values (returns `null`).
 *  - Preserves casing for lineage (e.g. `"Home Assistant"`).
 *  - Rejects non-string values (returns `null`).
 */
export function normalizeVendorLineage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Canonical metric keys persisted in `sensor_readings.metric`. Webhook
 * payloads use grower-friendly aliases (temp_f, humidity_percent, …) which
 * normalize to these.
 */
export type CanonicalMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "ph"
  | "ec"
  | "ppfd";

interface MetricRule {
  /** Output column key on sensor_readings.metric */
  canonical: CanonicalMetric;
  /** Min/max in canonical units. Reject if outside. */
  min: number;
  max: number;
  /** Optional unit converter from inbound payload value. */
  convert?: (v: number) => number;
}

/**
 * Inbound payload aliases → canonical metric + range guard.
 * Aliases are deliberately conservative: only the keys documented in the
 * V1 webhook payload contract.
 */
const METRIC_ALIASES: Record<string, MetricRule> = {
  temp_c: { canonical: "temperature_c", min: -10, max: 60 },
  temperature_c: { canonical: "temperature_c", min: -10, max: 60 },
  temp_f: {
    canonical: "temperature_c",
    // Spec range temp_f: 14–140 ≈ -10..60 °C
    min: -10,
    max: 60,
    convert: (v) => (v - 32) * (5 / 9),
  },
  humidity_pct: { canonical: "humidity_pct", min: 0, max: 100 },
  humidity_percent: { canonical: "humidity_pct", min: 0, max: 100 },
  vpd_kpa: { canonical: "vpd_kpa", min: 0, max: 5 },
  co2_ppm: { canonical: "co2_ppm", min: 250, max: 5000 },
  soil_moisture_pct: { canonical: "soil_moisture_pct", min: 0, max: 100 },
  soil_moisture: { canonical: "soil_moisture_pct", min: 0, max: 100 },
  ph: { canonical: "ph", min: 3, max: 10 },
  ec: { canonical: "ec", min: 0, max: 10 },
  ec_ms_cm: { canonical: "ec", min: 0, max: 10 },
  ppfd: { canonical: "ppfd", min: 0, max: 2500 },
} as const;

// ---------------------------------------------------------------------------
// Input shape (exactly the V1 spec payload)
// ---------------------------------------------------------------------------

export interface WebhookIngestPayload {
  tent_id?: unknown;
  source?: unknown;
  captured_at?: unknown;
  metrics?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Optional vendor lineage (e.g. "ecowitt", "home_assistant", "shelly").
   * Preserved verbatim into `raw_payload.vendor` for traceability.
   * NEVER used for ownership, auth, routing, or trust decisions —
   * any string the caller sends is accepted as lineage metadata only.
   */
  vendor?: unknown;
  // Caller-supplied user_id is *intentionally* ignored — server uses JWT.
  user_id?: unknown;
}

export type NormalizedRow = TablesInsert<"sensor_readings">;

export interface WebhookIngestNormalizationResult {
  ok: boolean;
  rows: NormalizedRow[];
  /** Per-metric or per-payload validation errors (terse, non-PII). */
  errors: string[];
  /** Metrics that were silently skipped (null / empty / non-finite). */
  skipped: string[];
  /** Stable per-payload fingerprint for request-level deduplication. */
  fingerprint: string | null;
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function coerceFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure normalization of one webhook payload into 1..N sensor_readings rows.
 *
 * Returns `ok: false` only when the payload itself is structurally invalid
 * (missing required fields, future timestamp, no valid metrics). Out-of-range
 * individual metrics are surfaced via `errors` AND excluded from `rows`.
 *
 * The caller (the edge function) decides the response code:
 *   - structural failure → 400
 *   - some metrics rejected, others valid → 200 with `errors` echoed
 *   - all metrics rejected → 400
 */
export function normalizeWebhookIngestPayload(
  input: WebhookIngestPayload,
  opts: { now?: Date } = {},
): WebhookIngestNormalizationResult {
  const errors: string[] = [];
  const skipped: string[] = [];

  if (!input || typeof input !== "object") {
    return {
      ok: false,
      rows: [],
      errors: ["payload required"],
      skipped: [],
      fingerprint: null,
    };
  }

  // tent_id ----------------------------------------------------------------
  const tentId = input.tent_id;
  if (!isNonEmptyString(tentId) || !UUID_RE.test(tentId)) {
    errors.push("tent_id required (uuid)");
  }

  // source -----------------------------------------------------------------
  const source = input.source;
  const canonicalSource = normalizeWebhookSource(source);
  if (!isNonEmptyString(source) || source.trim().length === 0) {
    errors.push("source required");
  } else if (!canonicalSource) {
    errors.push(`invalid source: ${source}`);
  }

  // captured_at ------------------------------------------------------------
  let capturedAtIso: string | null = null;
  if (!isNonEmptyString(input.captured_at)) {
    errors.push("captured_at required (ISO 8601)");
  } else {
    const t = Date.parse(input.captured_at);
    if (!Number.isFinite(t)) {
      errors.push(`invalid captured_at`);
    } else {
      const now = (opts.now ?? new Date()).getTime();
      if (t > now + FUTURE_TOLERANCE_MS) {
        errors.push("captured_at more than 5 minutes in the future");
      } else {
        capturedAtIso = new Date(t).toISOString();
      }
    }
  }

  // metrics ----------------------------------------------------------------
  const metricsObj =
    input.metrics && typeof input.metrics === "object"
      ? (input.metrics as Record<string, unknown>)
      : null;

  if (!metricsObj || Object.keys(metricsObj).length === 0) {
    errors.push("metrics required (at least one)");
  }

  // Fail fast on structural errors before walking metrics.
  const tentIdInvalid = !isNonEmptyString(tentId) || !UUID_RE.test(tentId);
  if (errors.length > 0 && (tentIdInvalid || !capturedAtIso || !canonicalSource)) {
    return { ok: false, rows: [], errors, skipped, fingerprint: null };
  }

  const rows: NormalizedRow[] = [];
  const fingerprintParts: string[] = [];

  if (metricsObj) {
    // Deterministic order: sorted by alias key.
    const aliasKeys = Object.keys(metricsObj).sort();
    for (const alias of aliasKeys) {
      const rule = METRIC_ALIASES[alias];
      const raw = metricsObj[alias];

      // Empty / missing — silently skip (never persist as 0).
      const numeric = coerceFinite(raw);
      if (numeric === null) {
        skipped.push(alias);
        continue;
      }

      if (!rule) {
        skipped.push(alias);
        continue;
      }

      const converted = rule.convert ? rule.convert(numeric) : numeric;
      if (!Number.isFinite(converted)) {
        errors.push(`${alias}: non-finite after conversion`);
        continue;
      }
      if (converted < rule.min || converted > rule.max) {
        errors.push(
          `${alias}: out of range (${converted.toFixed(2)} not in [${rule.min}, ${rule.max}])`,
        );
        continue;
      }

      rows.push({
        tent_id: tentId as string,
        metric: rule.canonical,
        value: converted,
        source: canonicalSource as WebhookSource,
        captured_at: capturedAtIso!,
        ts: capturedAtIso!,
        quality: "ok",
        device_id:
          input.metadata &&
          typeof input.metadata === "object" &&
          typeof (input.metadata as Record<string, unknown>).device_id ===
            "string"
            ? ((input.metadata as Record<string, unknown>).device_id as string)
            : null,
        raw_payload: sanitizeRawPayload(input) as unknown as NormalizedRow["raw_payload"],
      });

      fingerprintParts.push(`${rule.canonical}:${converted.toFixed(6)}`);
    }
  }

  if (rows.length === 0) {
    if (!errors.some((e) => e.includes("metrics required"))) {
      errors.push("no valid metrics");
    }
    return { ok: false, rows: [], errors, skipped, fingerprint: null };
  }

  const fingerprint = capturedAtIso
    ? `${tentId}|${canonicalSource}|${capturedAtIso}|${fingerprintParts.join(",")}`
    : null;

  return {
    ok: true,
    rows,
    errors,
    skipped,
    fingerprint,
  };
}

/**
 * Strip caller-supplied `user_id` and any other sensitive top-level keys
 * before persisting into `raw_payload`. The DB row's `user_id` is set by
 * the column DEFAULT (`auth.uid()`) — never by the request body.
 */
export function sanitizeRawPayload(
  input: WebhookIngestPayload,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isNonEmptyString(input.tent_id)) out.tent_id = input.tent_id;
  // Persist the canonical (trimmed/lowercased) source when the caller's
  // value resolves to an allow-listed label; fall back to the verbatim
  // non-empty string otherwise so audit logs still show what arrived.
  const canonicalSrc = normalizeWebhookSource(input.source);
  if (canonicalSrc) {
    out.source = canonicalSrc;
  } else if (isNonEmptyString(input.source)) {
    out.source = input.source;
  }
  if (isNonEmptyString(input.captured_at))
    out.captured_at = input.captured_at;
  if (input.metrics && typeof input.metrics === "object")
    out.metrics = input.metrics;
  if (input.metadata && typeof input.metadata === "object")
    out.metadata = input.metadata;
  // Vendor lineage: trimmed string only; empty/whitespace-only and
  // non-string values are dropped. Vendor is lineage metadata only —
  // never used for auth, ownership, or routing.
  const vendor = normalizeVendorLineage(input.vendor);
  if (vendor) out.vendor = vendor;
  // user_id is intentionally dropped.
  return out;
}

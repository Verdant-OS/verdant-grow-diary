/**
 * webhookNormalizationExplainer — pure, read-only helper that explains how
 * the `sensor-ingest-webhook` normalizer would treat a caller-supplied
 * JSON payload, without performing any I/O, network, Supabase, or write
 * action.
 *
 * Hard constraints:
 *  - No I/O. No fetch. No Supabase. No React. No hooks. No timers.
 *  - Does NOT mutate the input.
 *  - Does NOT change production ingest behavior — it wraps the existing
 *    pure helpers (`normalizeWebhookIngestPayload`, `sanitizeRawPayload`,
 *    `normalizeWebhookSource`, `normalizeVendorLineage`).
 *  - Vendor is preserved as **lineage only**; never used for auth.
 *  - Caller-supplied `user_id` and auth-like fields are surfaced as
 *    warnings — the production ingest path will continue to strip /
 *    ignore them as today.
 */
import {
  getWebhookMetricAliasKeys,
  normalizeVendorLineage,
  normalizeWebhookIngestPayload,
  normalizeWebhookSource,
  resolveWebhookMetricAlias,
  sanitizeRawPayload,
  WEBHOOK_ALLOWED_SOURCES,
  type CanonicalMetric,
  type WebhookIngestPayload,
  type WebhookSource,
} from "./sensorWebhookIngestRules";

export interface AcceptedMetric {
  alias: string;
  canonical: CanonicalMetric;
  value: number;
}

export interface SkippedMetric {
  alias: string;
  reason: string;
}

export interface RejectedMetric {
  alias: string;
  reason: string;
}

export interface ExplainedSource {
  raw: unknown;
  canonical: WebhookSource | null;
  reason: string | null;
}

export interface ExplainedVendor {
  raw: unknown;
  canonical: string | null;
  /**
   * Vendor is always lineage-only — never used for auth, ownership, or
   * routing. Surfaced here as a constant reminder for UI copy.
   */
  lineageOnly: true;
}

export interface WebhookNormalizationExplanation {
  /** True if the payload would produce at least one accepted reading. */
  ok: boolean;
  source: ExplainedSource;
  vendor: ExplainedVendor;
  acceptedMetrics: AcceptedMetric[];
  skippedMetrics: SkippedMetric[];
  rejectedMetrics: RejectedMetric[];
  /** Top-level payload errors (tent_id / captured_at / structural). */
  payloadErrors: string[];
  /** Non-blocking caller-mistake warnings (user_id present, auth-like keys). */
  warnings: string[];
  /** What would be persisted to `raw_payload` (user_id and auth-like keys stripped). */
  sanitizedRawPayload: Record<string, unknown>;
  /** Per-payload dedupe fingerprint (null when payload is invalid). */
  fingerprint: string | null;
}

/** Top-level keys that look like auth or ownership — never trusted from a bridge. */
const AUTH_LIKE_KEYS = new Set([
  "user_id",
  "userid",
  "owner_id",
  "ownerid",
  "authorization",
  "auth",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "password",
  "secret",
  "service_role",
  "service_role_key",
  "jwt",
  "bearer",
  "vbt",
]);

function isAuthLikeKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (AUTH_LIKE_KEYS.has(k)) return true;
  // Heuristic: anything containing "token", "secret", or "password" is suspect.
  return /token|secret|password|bearer|api[_-]?key/.test(k);
}

function collectAuthLikeWarnings(input: unknown, path: string, out: string[]): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (isAuthLikeKey(key)) {
      out.push(
        `Ignored '${fullPath}': bridge clients must never send auth, ownership, or secret fields — auth is the bridge token only.`,
      );
    }
  }
}

function coerceFiniteLocal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure explainer. Produces a structured breakdown of how the normalizer
 * would classify the payload. Never throws on bad input — returns a
 * structured explanation instead.
 */
export function explainWebhookNormalizationPayload(
  input: unknown,
): WebhookNormalizationExplanation {
  const warnings: string[] = [];

  // Defensive: the explainer must never crash on garbage input.
  const payload: WebhookIngestPayload =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as WebhookIngestPayload)
      : ({} as WebhookIngestPayload);

  // --- Warnings: top-level auth-like fields -------------------------------
  collectAuthLikeWarnings(payload, "", warnings);
  // Also walk metadata one level deep — bridges sometimes hide tokens there.
  if (payload && typeof payload === "object" && payload.metadata) {
    collectAuthLikeWarnings(payload.metadata, "metadata", warnings);
  }

  // --- Source classification ---------------------------------------------
  const rawSource = (payload as { source?: unknown }).source;
  const canonicalSource = normalizeWebhookSource(rawSource);
  let sourceReason: string | null = null;
  if (rawSource === undefined || rawSource === null || rawSource === "") {
    sourceReason = "source required";
  } else if (typeof rawSource !== "string") {
    sourceReason = "source must be a string";
  } else if (!canonicalSource) {
    sourceReason = `source '${rawSource}' is not in the allow-list (${WEBHOOK_ALLOWED_SOURCES.join(", ")})`;
  }

  // --- Vendor classification ---------------------------------------------
  const rawVendor = (payload as { vendor?: unknown }).vendor;
  const canonicalVendor = normalizeVendorLineage(rawVendor);

  // --- Run the real normalizer to mirror production behavior -------------
  const result = normalizeWebhookIngestPayload(payload);

  // --- Per-metric classification -----------------------------------------
  const accepted: AcceptedMetric[] = [];
  const skipped: SkippedMetric[] = [];
  const rejected: RejectedMetric[] = [];

  const metricsObj =
    payload && typeof payload === "object" && payload.metrics && typeof payload.metrics === "object"
      ? (payload.metrics as Record<string, unknown>)
      : null;

  const aliasKeys = metricsObj ? Object.keys(metricsObj).sort() : [];
  const knownAliases = new Set(getWebhookMetricAliasKeys());

  // Map produced rows back to aliases by canonical metric + numeric value
  // so we can show accepted entries with the user's alias key.
  const rowsByCanonical = new Map<CanonicalMetric, number>();
  for (const row of result.rows) {
    rowsByCanonical.set(row.metric as CanonicalMetric, (row.value as number) ?? NaN);
  }

  for (const alias of aliasKeys) {
    const raw = metricsObj![alias];

    if (isAuthLikeKey(alias)) {
      warnings.push(
        `Ignored 'metrics.${alias}': metric keys must not look like auth or secret fields.`,
      );
    }

    const numeric = coerceFiniteLocal(raw);
    if (numeric === null) {
      skipped.push({ alias, reason: "value is null, empty, or non-finite — skipped (never persisted as 0)" });
      continue;
    }

    if (!knownAliases.has(alias)) {
      skipped.push({ alias, reason: "unknown metric alias — not in the V1 webhook contract" });
      continue;
    }

    // Known alias + finite value: did production reject or accept?
    const rule = resolveWebhookMetricAlias(alias);
    const rejectMatch = result.errors.find((e) => e.startsWith(`${alias}:`));
    if (rejectMatch) {
      rejected.push({ alias, reason: rejectMatch.slice(alias.length + 1).trim() });
      continue;
    }

    if (rule && rowsByCanonical.has(rule.canonical)) {
      accepted.push({
        alias,
        canonical: rule.canonical,
        value: rowsByCanonical.get(rule.canonical)!,
      });
    } else {
      // Defensive fallback (should not happen for known alias + finite value).
      skipped.push({ alias, reason: "not produced by normalizer" });
    }
  }

  // --- Top-level (non per-alias) payload errors --------------------------
  const payloadErrors = result.errors.filter(
    (e) => !aliasKeys.some((a) => e.startsWith(`${a}:`)),
  );

  return {
    ok: result.ok,
    source: { raw: rawSource, canonical: canonicalSource, reason: sourceReason },
    vendor: { raw: rawVendor, canonical: canonicalVendor, lineageOnly: true },
    acceptedMetrics: accepted,
    skippedMetrics: skipped,
    rejectedMetrics: rejected,
    payloadErrors,
    warnings,
    sanitizedRawPayload: sanitizeRawPayload(payload),
    fingerprint: result.fingerprint,
  };
}

/**
 * Built-in example payloads used by the in-app debug screen. Keep these
 * fully synthetic — no real tent IDs, no real tokens.
 */
export const WEBHOOK_NORMALIZER_EXAMPLES: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  payload: Record<string, unknown>;
}> = [
  {
    id: "ecowitt-mqtt",
    label: "EcoWitt over MQTT",
    description: "MQTT bridge forwarding an EcoWitt gateway frame.",
    payload: {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metadata: { device_id: "ecowitt-gw-1" },
      metrics: {
        temp_c: 24.7,
        humidity_pct: 58,
        co2_ppm: 820,
      },
    },
  },
  {
    id: "home-assistant-webhook",
    label: "Home Assistant webhook",
    description: "Home Assistant `rest_command` forwarding sensor state.",
    payload: {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "webhook",
      vendor: "home_assistant",
      captured_at: "2026-06-04T12:00:00Z",
      metadata: { entity_id: "sensor.tent_a_temp" },
      metrics: {
        temperature_c: 24.7,
        humidity_pct: 58,
        vpd_kpa: 1.28,
      },
    },
  },
  {
    id: "generic-mqtt",
    label: "Generic MQTT",
    description: "Generic MQTT → HTTP bridge with no specific vendor.",
    payload: {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:05:00Z",
      metrics: {
        soil_moisture_pct: 41.2,
        ph: 6.1,
        ec: 1.6,
      },
    },
  },
];

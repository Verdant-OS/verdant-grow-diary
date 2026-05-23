/**
 * piIngestConfigRules — pure runtime config validation/merging for the
 * future `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No env reads. No Supabase. No React. No I/O. No fetch.
 *  - Only validates, merges, and freezes config objects. Caller decides how
 *    to source overrides.
 *
 * Config governs rate-limit windows, batch caps, allowed clock skew, and
 * the whitelists of sources/metrics the endpoint will accept. Defaults
 * align with the V0 contract in `docs/pi-ingest-readings-contract.md`.
 */

// ----------------------------- Types -----------------------------

export interface PiIngestConfig {
  readonly windowMs: number;
  readonly maxRequestsPerWindow: number;
  readonly maxReadingsPerBatch: number;
  readonly clockSkewMs: number;
  readonly allowedSources: readonly string[];
  readonly allowedMetrics: readonly string[];
}

export type PiIngestConfigFailureCode =
  | "not_an_object"
  | "invalid_window_ms"
  | "invalid_max_requests_per_window"
  | "invalid_max_readings_per_batch"
  | "invalid_clock_skew_ms"
  | "invalid_allowed_sources"
  | "invalid_allowed_metrics"
  | "empty_allowed_sources"
  | "empty_allowed_metrics";

export interface PiIngestConfigIssue {
  readonly code: PiIngestConfigFailureCode;
  readonly message: string;
}

export type PiIngestConfigValidationResult =
  | { readonly ok: true; readonly config: PiIngestConfig }
  | { readonly ok: false; readonly issues: readonly PiIngestConfigIssue[] };

// ----------------------------- Defaults -----------------------------

const DEFAULT_ALLOWED_SOURCES = ["pi_bridge"] as const;
const DEFAULT_ALLOWED_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;

export function defaultPiIngestConfig(): PiIngestConfig {
  return Object.freeze({
    windowMs: 60_000,
    maxRequestsPerWindow: 60,
    maxReadingsPerBatch: 50,
    clockSkewMs: 5 * 60_000,
    allowedSources: Object.freeze([...DEFAULT_ALLOWED_SOURCES]) as readonly string[],
    allowedMetrics: Object.freeze([...DEFAULT_ALLOWED_METRICS]) as readonly string[],
  });
}

// ----------------------------- Helpers -----------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function validateStringList(
  v: unknown,
  code: PiIngestConfigFailureCode,
  emptyCode: PiIngestConfigFailureCode,
  label: string,
): { ok: true; value: readonly string[] } | { ok: false; issue: PiIngestConfigIssue } {
  if (!Array.isArray(v))
    return { ok: false, issue: { code, message: `${label} must be an array of strings` } };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string")
      return { ok: false, issue: { code, message: `${label} must contain only strings` } };
    const t = item.trim();
    if (!t)
      return { ok: false, issue: { code, message: `${label} must not contain empty strings` } };
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  if (out.length === 0)
    return { ok: false, issue: { code: emptyCode, message: `${label} must not be empty` } };
  return { ok: true, value: Object.freeze(out) };
}

// ----------------------------- Validate -----------------------------

export function validatePiIngestConfig(raw: unknown): PiIngestConfigValidationResult {
  if (!isPlainObject(raw))
    return {
      ok: false,
      issues: [{ code: "not_an_object", message: "config must be a plain object" }],
    };

  const issues: PiIngestConfigIssue[] = [];

  if (!isPosInt(raw.windowMs))
    issues.push({ code: "invalid_window_ms", message: "windowMs must be a positive integer" });

  if (!isPosInt(raw.maxRequestsPerWindow))
    issues.push({
      code: "invalid_max_requests_per_window",
      message: "maxRequestsPerWindow must be a positive integer",
    });

  if (!isPosInt(raw.maxReadingsPerBatch))
    issues.push({
      code: "invalid_max_readings_per_batch",
      message: "maxReadingsPerBatch must be a positive integer",
    });

  if (!isNonNegInt(raw.clockSkewMs))
    issues.push({
      code: "invalid_clock_skew_ms",
      message: "clockSkewMs must be a non-negative integer",
    });

  const sources = validateStringList(
    raw.allowedSources,
    "invalid_allowed_sources",
    "empty_allowed_sources",
    "allowedSources",
  );
  if (!sources.ok) issues.push(sources.issue);

  const metrics = validateStringList(
    raw.allowedMetrics,
    "invalid_allowed_metrics",
    "empty_allowed_metrics",
    "allowedMetrics",
  );
  if (!metrics.ok) issues.push(metrics.issue);

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };

  const config: PiIngestConfig = Object.freeze({
    windowMs: raw.windowMs as number,
    maxRequestsPerWindow: raw.maxRequestsPerWindow as number,
    maxReadingsPerBatch: raw.maxReadingsPerBatch as number,
    clockSkewMs: raw.clockSkewMs as number,
    allowedSources: (sources as { ok: true; value: readonly string[] }).value,
    allowedMetrics: (metrics as { ok: true; value: readonly string[] }).value,
  });

  return { ok: true, config };
}

// ----------------------------- Merge -----------------------------

/**
 * Merge a validated base config with a partial override and re-validate.
 * Override fields are shallow-replaced (arrays replace, never concat).
 */
export function mergePiIngestConfig(
  base: PiIngestConfig,
  override?: Partial<PiIngestConfig> | null,
): PiIngestConfigValidationResult {
  const merged: Record<string, unknown> = {
    windowMs: base.windowMs,
    maxRequestsPerWindow: base.maxRequestsPerWindow,
    maxReadingsPerBatch: base.maxReadingsPerBatch,
    clockSkewMs: base.clockSkewMs,
    allowedSources: [...base.allowedSources],
    allowedMetrics: [...base.allowedMetrics],
  };

  if (override && isPlainObject(override)) {
    for (const key of Object.keys(override) as (keyof PiIngestConfig)[]) {
      const v = (override as Record<string, unknown>)[key];
      if (v === undefined) continue;
      if (key === "allowedSources" || key === "allowedMetrics") {
        merged[key] = Array.isArray(v) ? [...v] : v;
      } else {
        merged[key] = v;
      }
    }
  }

  return validatePiIngestConfig(merged);
}

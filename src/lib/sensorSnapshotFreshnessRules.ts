/**
 * Sensor Snapshot Freshness Rules (Sensor Source Badges v1)
 * ---------------------------------------------------------
 * Pure, deterministic resolver that turns a normalized sensor snapshot
 * input into a safe display model for the SensorSourceBadge and
 * SensorSnapshotCard presenters.
 *
 * Safety contract:
 *  - No fetch, no DB client, no console.*, no `Date.now()` inside the
 *    resolver — `now` is an injected option.
 *  - Never returns `raw_payload`, secrets, tokens, or private identifiers.
 *  - Demo data stays demo regardless of age.
 *  - Missing/unknown source becomes "invalid".
 *  - Missing or future `captured_at` is never treated as healthy/current.
 *  - Stale data flips `effectiveSource` to "stale" and never renders green.
 *  - Invalid data flips `effectiveSource` to "invalid" and never renders green.
 *  - Top-level source vocabulary is locked to:
 *      live | manual | csv | demo | stale | invalid
 *    Vendor lineage is carried as a separate, optional, safe label only.
 */

export type SensorSnapshotSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export type SensorSnapshotFreshnessState =
  | "fresh"
  | "stale"
  | "invalid"
  | "demo"
  | "unknown";

export type SensorSnapshotTrustTone =
  | "ok"
  | "info"
  | "sample"
  | "warning"
  | "danger"
  | "unknown";

export type SensorSnapshotMetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "soil"
  | "ec"
  | "ph";

export type SensorSnapshotMetricKind = "environment" | "soil" | "other";

export interface SensorSnapshotMetricInput {
  key: SensorSnapshotMetricKey;
  /** Raw numeric reading or null when not present. */
  value: number | null | undefined;
  /** Display unit, e.g. "°C", "%", "kPa", "µS/cm". Safe to render. */
  unit?: string | null;
  /** Optional override of kind for stale-threshold selection. */
  kind?: SensorSnapshotMetricKind;
}

export interface SensorSnapshotInput {
  /** Original provenance label. */
  source?: string | null;
  /** Optional vendor/source-app lineage. Must be non-secret. */
  sourceDetail?: string | null;
  /** ISO timestamp captured at the source. Source of truth for age. */
  capturedAt?: string | null;
  /** Optional confidence in [0,1]. */
  confidence?: number | null;
  /** Optional explicit invalid flag (e.g. failed validation). */
  invalid?: boolean;
  /** Optional metrics to include in the safe display. */
  metrics?: SensorSnapshotMetricInput[];
}

export interface ResolveOptions {
  /** Injected clock for deterministic tests. Defaults to Date.now(). */
  now?: Date | number;
  /** Override stale window for environment metrics (ms). */
  environmentStaleWindowMs?: number;
  /** Override stale window for soil metrics (ms). */
  soilStaleWindowMs?: number;
}

export interface SensorSnapshotMetricDisplay {
  key: SensorSnapshotMetricKey;
  /** Safe stringified value (e.g. "24.3") or null if unavailable. */
  display: string | null;
  unit: string | null;
}

export type SensorSnapshotReasonCode =
  | "fresh"
  | "stale_environment"
  | "stale_soil"
  | "missing_captured_at"
  | "future_captured_at"
  | "unknown_source"
  | "invalid_flag"
  | "demo_source"
  | "manual_source"
  | "csv_source";

export interface SensorSnapshotDisplayModel {
  effectiveSource: SensorSnapshotSource;
  originalSource: string | null;
  capturedAt: string | null;
  ageMs: number | null;
  ageLabel: string | null;
  freshness: SensorSnapshotFreshnessState;
  tone: SensorSnapshotTrustTone;
  confidence: number | null;
  reasonCodes: SensorSnapshotReasonCode[];
  /** Safe vendor/source-app label, e.g. "ggs_controller". */
  sourceDetail: string | null;
  metrics: SensorSnapshotMetricDisplay[];
  /** Stable warning copy for stale/invalid/missing. Null when fresh. */
  warning: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_ENVIRONMENT_STALE_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_SOIL_STALE_WINDOW_MS = 60 * 60 * 1000;

const ALLOWED_SOURCES: ReadonlySet<SensorSnapshotSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

const SOIL_METRIC_KEYS: ReadonlySet<SensorSnapshotMetricKey> = new Set([
  "soil",
  "ec",
  "ph",
]);

// Allow lowercase ASCII vendor labels only. No spaces, no quotes, no slashes.
const SAFE_SOURCE_DETAIL_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowMs(opts?: ResolveOptions): number {
  const n = opts?.now;
  if (n instanceof Date) return n.getTime();
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return Date.now();
}

function normalizeSource(source: unknown): SensorSnapshotSource | null {
  if (typeof source !== "string") return null;
  const s = source.toLowerCase().trim() as SensorSnapshotSource;
  return ALLOWED_SOURCES.has(s) ? s : null;
}

function safeSourceDetail(detail: unknown): string | null {
  if (typeof detail !== "string") return null;
  const trimmed = detail.trim().toLowerCase();
  if (!trimmed) return null;
  return SAFE_SOURCE_DETAIL_RE.test(trimmed) ? trimmed : null;
}

function parseCapturedAt(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return { iso: value, ms };
}

export function formatAgeLabel(ageMs: number | null): string | null {
  if (ageMs === null || !Number.isFinite(ageMs)) return null;
  if (ageMs < 0) return "in the future";
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function metricKindFor(
  key: SensorSnapshotMetricKey,
  override?: SensorSnapshotMetricKind,
): SensorSnapshotMetricKind {
  if (override) return override;
  return SOIL_METRIC_KEYS.has(key) ? "soil" : "environment";
}

function staleWindowFor(
  kind: SensorSnapshotMetricKind,
  opts?: ResolveOptions,
): number {
  if (kind === "soil") {
    return opts?.soilStaleWindowMs ?? DEFAULT_SOIL_STALE_WINDOW_MS;
  }
  return opts?.environmentStaleWindowMs ?? DEFAULT_ENVIRONMENT_STALE_WINDOW_MS;
}

function clampConfidence(c: unknown): number | null {
  if (typeof c !== "number" || !Number.isFinite(c)) return null;
  if (c < 0) return 0;
  if (c > 1) return 1;
  return c;
}

function safeMetricDisplay(
  m: SensorSnapshotMetricInput,
): SensorSnapshotMetricDisplay {
  let display: string | null = null;
  if (typeof m.value === "number" && Number.isFinite(m.value)) {
    // Two-decimal cap to avoid leaking unstable float artifacts.
    display = Math.abs(m.value) >= 100
      ? m.value.toFixed(0)
      : m.value.toFixed(1);
  }
  const unit =
    typeof m.unit === "string" && m.unit.length > 0 && m.unit.length <= 8
      ? m.unit
      : null;
  return { key: m.key, display, unit };
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

export function resolveSensorSnapshotDisplay(
  input: SensorSnapshotInput | null | undefined,
  options?: ResolveOptions,
): SensorSnapshotDisplayModel {
  const reasonCodes: SensorSnapshotReasonCode[] = [];
  const safeInput: SensorSnapshotInput = input ?? {};
  const normalizedSource = normalizeSource(safeInput.source);
  const originalSource =
    typeof safeInput.source === "string" && safeInput.source.length > 0
      ? safeInput.source
      : null;
  const sourceDetail = safeSourceDetail(safeInput.sourceDetail);
  const captured = parseCapturedAt(safeInput.capturedAt);
  const confidence = clampConfidence(safeInput.confidence);

  // Build metric display first — metric kind affects stale window choice.
  const metrics: SensorSnapshotMetricDisplay[] = (safeInput.metrics ?? [])
    .filter((m): m is SensorSnapshotMetricInput => !!m && typeof m.key === "string")
    .map(safeMetricDisplay);

  // 1. Invalid wins everything except demo labeling rules below.
  if (safeInput.invalid === true) {
    reasonCodes.push("invalid_flag");
    return finalize({
      effectiveSource: "invalid",
      originalSource,
      capturedAt: captured?.iso ?? null,
      ageMs: null,
      ageLabel: null,
      freshness: "invalid",
      tone: "danger",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  // 2. Unknown / missing source becomes invalid.
  if (!normalizedSource) {
    reasonCodes.push("unknown_source");
    return finalize({
      effectiveSource: "invalid",
      originalSource,
      capturedAt: captured?.iso ?? null,
      ageMs: null,
      ageLabel: null,
      freshness: "invalid",
      tone: "danger",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  // 3. Demo stays demo regardless of age.
  if (normalizedSource === "demo") {
    reasonCodes.push("demo_source");
    return finalize({
      effectiveSource: "demo",
      originalSource,
      capturedAt: captured?.iso ?? null,
      ageMs: captured ? Math.max(0, nowMs(options) - captured.ms) : null,
      ageLabel: captured
        ? formatAgeLabel(Math.max(0, nowMs(options) - captured.ms))
        : null,
      freshness: "demo",
      tone: "sample",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  // 4. Source already declared stale/invalid upstream — preserve it.
  if (normalizedSource === "invalid") {
    reasonCodes.push("invalid_flag");
    return finalize({
      effectiveSource: "invalid",
      originalSource,
      capturedAt: captured?.iso ?? null,
      ageMs: null,
      ageLabel: null,
      freshness: "invalid",
      tone: "danger",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  if (normalizedSource === "stale") {
    return finalize({
      effectiveSource: "stale",
      originalSource,
      capturedAt: captured?.iso ?? null,
      ageMs: captured ? Math.max(0, nowMs(options) - captured.ms) : null,
      ageLabel: captured
        ? formatAgeLabel(Math.max(0, nowMs(options) - captured.ms))
        : null,
      freshness: "stale",
      tone: "warning",
      confidence,
      reasonCodes:
        reasonCodes.length > 0 ? reasonCodes : ["stale_environment"],
      sourceDetail,
      metrics,
    });
  }

  // 5. For live/manual/csv, captured_at is required to be healthy.
  if (!captured) {
    reasonCodes.push("missing_captured_at");
    return finalize({
      effectiveSource: "invalid",
      originalSource,
      capturedAt: null,
      ageMs: null,
      ageLabel: null,
      freshness: "invalid",
      tone: "danger",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  const now = nowMs(options);
  const ageMs = now - captured.ms;

  // 6. Future captured_at is never healthy.
  if (ageMs < 0) {
    reasonCodes.push("future_captured_at");
    return finalize({
      effectiveSource: "invalid",
      originalSource,
      capturedAt: captured.iso,
      ageMs,
      ageLabel: formatAgeLabel(ageMs),
      freshness: "invalid",
      tone: "danger",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  // 7. Determine stale-window from the most demanding included metric.
  // Soil-only snapshots get the soil window; mixed/environment snapshots
  // get the stricter environment window. This protects against
  // mislabeling stale environment data as fresh.
  const hasEnvMetric =
    metrics.length === 0 ||
    metrics.some(
      (m) => metricKindFor(m.key) === "environment",
    );
  const kind: SensorSnapshotMetricKind = hasEnvMetric
    ? "environment"
    : "soil";
  const staleWindow = staleWindowFor(kind, options);

  if (ageMs > staleWindow) {
    reasonCodes.push(
      kind === "soil" ? "stale_soil" : "stale_environment",
    );
    return finalize({
      effectiveSource: "stale",
      originalSource,
      capturedAt: captured.iso,
      ageMs,
      ageLabel: formatAgeLabel(ageMs),
      freshness: "stale",
      tone: "warning",
      confidence,
      reasonCodes,
      sourceDetail,
      metrics,
    });
  }

  // 8. Fresh.
  if (normalizedSource === "manual") reasonCodes.push("manual_source");
  else if (normalizedSource === "csv") reasonCodes.push("csv_source");
  else reasonCodes.push("fresh");

  return finalize({
    effectiveSource: normalizedSource,
    originalSource,
    capturedAt: captured.iso,
    ageMs,
    ageLabel: formatAgeLabel(ageMs),
    freshness: "fresh",
    tone:
      normalizedSource === "live"
        ? "ok"
        : normalizedSource === "manual"
          ? "info"
          : "info",
    confidence,
    reasonCodes,
    sourceDetail,
    metrics,
  });
}

function finalize(
  m: Omit<SensorSnapshotDisplayModel, "warning">,
): SensorSnapshotDisplayModel {
  return {
    ...m,
    warning: deriveWarningCopy(m),
  };
}

function deriveWarningCopy(
  m: Omit<SensorSnapshotDisplayModel, "warning">,
): string | null {
  switch (m.freshness) {
    case "fresh":
      return null;
    case "demo":
      return "Demo data — never treated as live. Enter a manual reading before making decisions.";
    case "stale":
      return m.ageLabel
        ? `Sensor data is stale (${m.ageLabel}). Refresh evidence before using this for decisions. Save will be marked accordingly.`
        : "Sensor data is stale. Refresh evidence before using this for decisions. Save will be marked accordingly.";
    case "invalid":
      if (m.reasonCodes.includes("future_captured_at")) {
        return "Sensor timestamp is in the future. Treated as invalid. Check latest sensor ingestion.";
      }
      if (m.reasonCodes.includes("missing_captured_at")) {
        return "Sensor data is missing a capture time. Treated as invalid. Enter a manual reading or check latest sensor ingestion.";
      }
      if (m.reasonCodes.includes("unknown_source")) {
        return "Sensor source is unknown. Treated as invalid. Confirm the source label.";
      }
      return "Sensor data is invalid. Refresh evidence before using this for decisions.";
    case "unknown":
    default:
      return "Sensor context is unavailable. Enter a manual reading or check latest sensor ingestion.";
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function isHealthySensorDisplay(
  m: SensorSnapshotDisplayModel,
): boolean {
  return m.freshness === "fresh" && m.tone === "ok";
}

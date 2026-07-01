/**
 * phenoComparisonRules — pure classification rules for the read-only
 * Pheno Comparison preview surface.
 *
 * Responsibilities:
 *   - Sanitize photo URLs (http/https only).
 *   - Classify a candidate's sensor snapshot: source provenance, freshness
 *     (fresh vs stale), and validity (valid vs invalid) using the canonical
 *     Verdant sensor-truth rules.
 *   - Compute the missing-data / degraded-telemetry flags a candidate card
 *     must surface: no photo, no snapshot, missing temp/RH/VPD, missing
 *     EC/pH/PPFD when relevant, stale reading, invalid reading.
 *   - Gate whether an affirmative "readings complete" indicator may be
 *     shown. Bad, stale, invalid, demo, or incomplete telemetry is NEVER
 *     displayable as healthy.
 *
 * Hard constraints (see AGENTS.md — Sensor Truth Rules):
 *   - Pure. No I/O, no React, no Supabase, no AI, no timers, no randomness.
 *   - Deterministic: same input → same output. Time is injected via `now`.
 *   - Null-safe. Unknown/bad telemetry is never treated as healthy.
 *   - Never promotes manual/demo/stale/invalid to live.
 */
import {
  buildCanonicalSourceBadge,
  type CanonicalSourceBadgeViewModel,
} from "./canonicalSourceBadgeViewModel";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const SENSOR_METRIC_KEYS = [
  "temp",
  "rh",
  "vpd",
  "ec",
  "ph",
  "ppfd",
] as const;
export type SensorMetricKey = (typeof SENSOR_METRIC_KEYS)[number];

/** Metrics every usable environmental snapshot must carry. */
export const CORE_SENSOR_METRIC_KEYS: readonly SensorMetricKey[] = [
  "temp",
  "rh",
  "vpd",
];

export const SENSOR_METRIC_LABELS: Record<SensorMetricKey, string> = {
  temp: "Temp",
  rh: "RH",
  vpd: "VPD",
  ec: "EC",
  ph: "pH",
  ppfd: "PPFD",
};

export const SENSOR_METRIC_UNITS: Record<SensorMetricKey, string> = {
  temp: "°C",
  rh: "%",
  vpd: "kPa",
  ec: "mS/cm",
  ph: "",
  ppfd: "µmol/m²/s",
};

// ---------------------------------------------------------------------------
// Missing-data flags
// ---------------------------------------------------------------------------

export type MissingDataFlagCode =
  | "no_photo"
  | "no_sensor_snapshot"
  | "missing_temp"
  | "missing_rh"
  | "missing_vpd"
  | "missing_ec"
  | "missing_ph"
  | "missing_ppfd"
  | "missing_confidence"
  | "stale_reading"
  | "invalid_reading";

export const MISSING_DATA_FLAG_LABELS: Record<MissingDataFlagCode, string> = {
  no_photo: "No photo",
  no_sensor_snapshot: "No sensor snapshot",
  missing_temp: "Missing temp",
  missing_rh: "Missing RH",
  missing_vpd: "Missing VPD",
  missing_ec: "Missing EC",
  missing_ph: "Missing pH",
  missing_ppfd: "Missing PPFD",
  missing_confidence: "Confidence unknown",
  stale_reading: "Stale reading",
  invalid_reading: "Invalid reading",
};

const METRIC_MISSING_FLAG: Record<SensorMetricKey, MissingDataFlagCode> = {
  temp: "missing_temp",
  rh: "missing_rh",
  vpd: "missing_vpd",
  ec: "missing_ec",
  ph: "missing_ph",
  ppfd: "missing_ppfd",
};

/** Deterministic display/collection order for flag codes. */
const FLAG_ORDER: readonly MissingDataFlagCode[] = [
  "no_sensor_snapshot",
  "invalid_reading",
  "stale_reading",
  "missing_temp",
  "missing_rh",
  "missing_vpd",
  "missing_ec",
  "missing_ph",
  "missing_ppfd",
  "missing_confidence",
  "no_photo",
];

// ---------------------------------------------------------------------------
// Freshness window
// ---------------------------------------------------------------------------

/** Default freshness window: a reading older than this is stale. */
export const DEFAULT_SNAPSHOT_STALE_AFTER_MS = 3 * 60 * 60 * 1000; // 3h

/**
 * Grace for benign clock skew. A `capturedAt` further in the future than this
 * is bad telemetry (negative age) and is treated as stale, never as fresh.
 */
export const FUTURE_SKEW_GRACE_MS = 60 * 1000; // 1 min

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PhenoSensorSnapshotInput {
  /** Canonical provenance: live | manual | csv | demo | stale | invalid. */
  source?: string | null;
  /** Optional hardware provider lineage (e.g. "ecowitt"). Never a source. */
  provider?: string | null;
  /** ISO timestamp the reading was captured at the source. */
  capturedAt?: string | null;
  temp?: number | null;
  rh?: number | null;
  vpd?: number | null;
  ec?: number | null;
  ph?: number | null;
  ppfd?: number | null;
  /** EC/pH are relevant to flag as missing (e.g. hydro/coco run). */
  ecPhRelevant?: boolean;
  /** PPFD is relevant to flag as missing (e.g. veg/flower canopy). */
  ppfdRelevant?: boolean;
  confidence?: number | null;
}

export interface ClassifySnapshotOptions {
  /** Injected "now" epoch ms. Required for deterministic freshness. */
  now: number;
  /** Override the freshness window. */
  staleAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface MetricCell {
  key: SensorMetricKey;
  label: string;
  unit: string;
  value: number | null;
  present: boolean;
  /** Whether this metric matters for this candidate (drives missing flags). */
  relevant: boolean;
  /** True when a present value fails a sanity check. */
  invalid: boolean;
  invalidReason: string | null;
}

export interface ClassifiedSnapshot {
  present: true;
  badge: CanonicalSourceBadgeViewModel;
  /** Normalized (lowercased) source. */
  source: string;
  capturedAt: string | null;
  ageMs: number | null;
  isDemo: boolean;
  isStale: boolean;
  isInvalid: boolean;
  metrics: MetricCell[];
  /** Flags contributed by this snapshot (metrics + stale + invalid). */
  missingFlags: MissingDataFlagCode[];
  /**
   * True only when this reading may be presented with an affirmative
   * "readings complete" indicator. False for demo/stale/invalid/unknown
   * provenance, any invalid metric, or any missing relevant metric.
   */
  canShowHealthy: boolean;
}

// ---------------------------------------------------------------------------
// Photo URL sanitization (http/https only)
// ---------------------------------------------------------------------------

export function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Same-origin root-relative path (e.g. "/placeholder.svg"). Explicitly
  // NOT protocol-relative ("//host/...") which would resolve to a third
  // party. Safer than an external URL and avoids off-origin network fetches.
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metric validity
// ---------------------------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Per-metric sanity check. Returns an invalid reason when a *present* value
 * is physically implausible or a classic bad-telemetry signature (humidity
 * pinned at 0/100, pH out of range, etc.). Absent values are not "invalid"
 * here — that is handled by the missing-metric flags.
 */
function metricInvalidReason(
  key: SensorMetricKey,
  value: number | null,
): string | null {
  if (value === null) return null;
  switch (key) {
    case "temp":
      if (value < 0 || value > 60) return "Temp out of plausible range";
      return null;
    case "rh":
      if (value <= 0 || value >= 100) return "Humidity pinned at 0/100%";
      return null;
    case "vpd":
      if (value < 0 || value > 6) return "VPD out of plausible range";
      return null;
    case "ec":
      if (value < 0 || value > 10) return "EC out of plausible range";
      return null;
    case "ph":
      if (value < 3 || value > 9) return "pH out of realistic range";
      return null;
    case "ppfd":
      if (value < 0 || value > 3000) return "PPFD out of plausible range";
      return null;
    default:
      return null;
  }
}

function metricRelevant(
  key: SensorMetricKey,
  input: PhenoSensorSnapshotInput,
): boolean {
  if (CORE_SENSOR_METRIC_KEYS.includes(key)) return true;
  if (key === "ec" || key === "ph") return input.ecPhRelevant === true;
  if (key === "ppfd") return input.ppfdRelevant === true;
  return false;
}

function readMetricValue(
  key: SensorMetricKey,
  input: PhenoSensorSnapshotInput,
): number | null {
  const raw = input[key];
  return isFiniteNumber(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// Snapshot classification
// ---------------------------------------------------------------------------

export function classifyPhenoSnapshot(
  input: PhenoSensorSnapshotInput,
  opts: ClassifySnapshotOptions,
): ClassifiedSnapshot {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_SNAPSHOT_STALE_AFTER_MS;
  const badge = buildCanonicalSourceBadge({
    source: input.source,
    provider: input.provider,
  });
  const source = badge.normalizedSource;
  const isDemo = source === "demo";

  // Freshness. A snapshot with an unparseable/missing timestamp cannot be
  // proven current, so it is treated as stale (never shown as current). A
  // meaningfully future-dated reading (device/clock skew beyond a small
  // grace) is also bad telemetry — a negative age must never read as fresh,
  // so it is treated as stale and can never set `canShowHealthy`.
  const ts = input.capturedAt ? Date.parse(input.capturedAt) : NaN;
  const hasTs = Number.isFinite(ts);
  const ageMs = hasTs ? opts.now - ts : null;
  const isFutureDated = ageMs !== null && ageMs < -FUTURE_SKEW_GRACE_MS;
  const isStale =
    source === "stale" ||
    isFutureDated ||
    (ageMs !== null ? ageMs > staleAfterMs : true);

  // Metrics.
  const metrics: MetricCell[] = SENSOR_METRIC_KEYS.map((key) => {
    const value = readMetricValue(key, input);
    const present = value !== null;
    const relevant = metricRelevant(key, input);
    const invalidReason = metricInvalidReason(key, value);
    return {
      key,
      label: SENSOR_METRIC_LABELS[key],
      unit: SENSOR_METRIC_UNITS[key],
      value,
      present,
      relevant,
      invalid: invalidReason !== null,
      invalidReason,
    };
  });

  const anyMetricInvalid = metrics.some((m) => m.invalid);
  // Unknown provenance is bad telemetry — never healthy, treated as invalid.
  const isInvalid = source === "invalid" || badge.isUnknown || anyMetricInvalid;

  // Verdant's sensor contract requires a confidence on every reading. Unknown
  // or implausible confidence (missing, non-finite, outside 0..1) is
  // incomplete telemetry: it is surfaced as a visible flag and can never be
  // eligible for the healthy state.
  const hasKnownConfidence =
    typeof input.confidence === "number" &&
    Number.isFinite(input.confidence) &&
    input.confidence >= 0 &&
    input.confidence <= 1;

  // Missing-metric flags (only for relevant metrics).
  const missing: MissingDataFlagCode[] = [];
  if (isInvalid) missing.push("invalid_reading");
  if (isStale) missing.push("stale_reading");
  for (const m of metrics) {
    if (m.relevant && !m.present) missing.push(METRIC_MISSING_FLAG[m.key]);
  }
  if (!hasKnownConfidence) missing.push("missing_confidence");

  const allCorePresent = CORE_SENSOR_METRIC_KEYS.every((k) => {
    const cell = metrics.find((m) => m.key === k);
    return cell?.present === true;
  });
  const anyRelevantMissing = metrics.some((m) => m.relevant && !m.present);
  const trustworthyProvenance =
    source === "live" || source === "manual" || source === "csv";

  const canShowHealthy =
    trustworthyProvenance &&
    !isStale &&
    !isInvalid &&
    allCorePresent &&
    !anyRelevantMissing &&
    hasKnownConfidence;

  return {
    present: true,
    badge,
    source,
    capturedAt: input.capturedAt ?? null,
    ageMs,
    isDemo,
    isStale,
    isInvalid,
    metrics,
    missingFlags: orderFlags(missing),
    canShowHealthy,
  };
}

// ---------------------------------------------------------------------------
// Candidate-level flag collection
// ---------------------------------------------------------------------------

export interface CollectCandidateFlagsInput {
  hasPhoto: boolean;
  snapshot: ClassifiedSnapshot | null;
}

/**
 * Roll up every missing-data flag a candidate card must surface. Absent
 * snapshot yields `no_sensor_snapshot`; otherwise the snapshot's own flags
 * are merged. Deterministic order, de-duplicated.
 */
export function collectCandidateMissingFlags(
  input: CollectCandidateFlagsInput,
): MissingDataFlagCode[] {
  const flags: MissingDataFlagCode[] = [];
  if (!input.snapshot) {
    flags.push("no_sensor_snapshot");
  } else {
    flags.push(...input.snapshot.missingFlags);
  }
  if (!input.hasPhoto) flags.push("no_photo");
  return orderFlags(flags);
}

export function missingFlagLabel(code: MissingDataFlagCode): string {
  return MISSING_DATA_FLAG_LABELS[code];
}

function orderFlags(
  flags: readonly MissingDataFlagCode[],
): MissingDataFlagCode[] {
  const seen = new Set<MissingDataFlagCode>();
  const out: MissingDataFlagCode[] = [];
  for (const code of FLAG_ORDER) {
    if (flags.includes(code) && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Empty-state copy — plain, honest, demo-safe. One sentence per flag so the
// presenter renders consistent language instead of ad-hoc strings in JSX.
// None of these read as healthy/OK/complete for a risky/missing state; the
// only occurrence of "healthy" is an explicit *negation*.
// ---------------------------------------------------------------------------

export const PHENO_EMPTY_STATE_COPY: Record<MissingDataFlagCode, string> = {
  no_photo: "No photo attached for this candidate.",
  no_sensor_snapshot: "No sensor snapshot attached for this timeline point.",
  missing_temp: "Missing temp, so environment confidence is limited.",
  missing_rh: "Missing RH, so environment confidence is limited.",
  missing_vpd: "Missing VPD, so environment confidence is limited.",
  missing_ec: "Missing EC for this comparison context.",
  missing_ph: "Missing pH for this comparison context.",
  missing_ppfd: "Missing PPFD for this comparison context.",
  missing_confidence:
    "Reading omits a valid confidence — treated as incomplete telemetry.",
  stale_reading: "Reading is stale — do not treat as current.",
  invalid_reading: "Reading is invalid — excluded from healthy status.",
};

export function emptyStateCopy(code: MissingDataFlagCode): string {
  return PHENO_EMPTY_STATE_COPY[code];
}

/** Page-level caution shown near the title. Reinforces demo/not-healthy. */
export const PHENO_COMPARISON_CONFIDENCE_CAVEAT: string =
  "Preview confidence is limited — sample data only. Missing, stale, or " +
  "invalid readings are flagged and never shown as healthy.";

// ---------------------------------------------------------------------------
// Evidence status — a single cautious status chip per candidate. Only a
// fresh, valid, complete, trustworthy candidate WITH a photo is "present";
// every other state is risky and must never read as healthy/OK/complete.
// ---------------------------------------------------------------------------

export type EvidenceStatusCode =
  | "evidence_present"
  | "limited_evidence"
  | "evidence_missing"
  | "stale"
  | "invalid"
  | "demo"
  | "unknown";

export type EvidenceStatusTone = "neutral" | "caution" | "danger";

export interface EvidenceStatus {
  code: EvidenceStatusCode;
  label: string;
  tone: EvidenceStatusTone;
  /** True when this state must never be presented as healthy/complete. */
  risky: boolean;
}

const EVIDENCE_STATUS_LABELS: Record<EvidenceStatusCode, string> = {
  evidence_present: "Evidence present",
  limited_evidence: "Limited evidence",
  evidence_missing: "Evidence missing",
  stale: "Stale reading",
  invalid: "Invalid reading",
  demo: "Demo/sample reading",
  unknown: "Unknown telemetry",
};

const EVIDENCE_STATUS_TONES: Record<EvidenceStatusCode, EvidenceStatusTone> = {
  evidence_present: "neutral",
  limited_evidence: "caution",
  evidence_missing: "caution",
  stale: "caution",
  invalid: "danger",
  demo: "caution",
  unknown: "danger",
};

function evidenceStatus(code: EvidenceStatusCode): EvidenceStatus {
  return {
    code,
    label: EVIDENCE_STATUS_LABELS[code],
    tone: EVIDENCE_STATUS_TONES[code],
    risky: code !== "evidence_present",
  };
}

export interface DeriveEvidenceStatusInput {
  hasPhoto: boolean;
  snapshot: ClassifiedSnapshot | null;
}

/**
 * Reduce a candidate to one cautious status. Severity order (worst first)
 * guarantees a bad reading never hides behind a milder label:
 *   unknown → invalid → stale → demo → evidence_missing → limited → present.
 */
export function deriveEvidenceStatus(
  input: DeriveEvidenceStatusInput,
): EvidenceStatus {
  const snap = input.snapshot;
  if (!snap) return evidenceStatus("evidence_missing");
  if (snap.badge.isUnknown) return evidenceStatus("unknown");
  if (snap.isInvalid) return evidenceStatus("invalid");
  if (snap.isStale) return evidenceStatus("stale");
  if (snap.isDemo) return evidenceStatus("demo");
  // Fresh, valid, known, non-demo provenance.
  if (!snap.canShowHealthy || !input.hasPhoto) {
    return evidenceStatus("limited_evidence");
  }
  return evidenceStatus("evidence_present");
}

// ---------------------------------------------------------------------------
// Healthy-language guard — pure predicate used by tests (and available to the
// presenter) to prove risky states never render positive status language.
// Negating safety phrases (e.g. "excluded from healthy status") are stripped
// first so honest caveats do not trip a false positive.
// ---------------------------------------------------------------------------

/** Phrases that mention a positive term only to negate/qualify it. */
export const HEALTHY_SAFE_NEGATIONS: readonly string[] = [
  "excluded from healthy status",
  "never shown as healthy",
  "not shown as healthy",
  "not treated as healthy",
  "not healthy",
  "do not treat as current",
];

/** Positive status language that must never describe risky telemetry. */
export const HEALTHY_POSITIVE_PATTERNS: readonly RegExp[] = [
  /\bhealthy\b/,
  /\bok\b/,
  /\ball good\b/,
  /\ball clear\b/,
  /\bno issues\b/,
  /\bnormal\b/,
  /\bcomplete\b/,
  /\bpassed\b/,
  /\bverified\b/,
  /\bsuccess\b/,
];

/**
 * True when `raw` contains positive health/success status language after
 * removing known negating safety phrases. Deterministic, case-insensitive.
 */
export function containsHealthyStatusLanguage(raw: string): boolean {
  let text = ` ${(raw ?? "").toLowerCase()} `;
  for (const phrase of HEALTHY_SAFE_NEGATIONS) {
    text = text.split(phrase).join(" ");
  }
  return HEALTHY_POSITIVE_PATTERNS.some((re) => re.test(text));
}

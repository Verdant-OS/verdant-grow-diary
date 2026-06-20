/**
 * Verdant cost-domain measurement types and pure helpers.
 *
 * Two cost domains MUST stay separate:
 *   - "db_refresh"  : Postgres / materialized view / window summary refresh cost.
 *   - "llm_prompt"  : AI Doctor / Coach prompt token cost (provider-billed).
 *   - "ingest_rate" : Sensor reading inbound cadence (write-pressure indicator).
 *
 * This module is pure. It does not perform I/O, does not throttle, does not
 * call Supabase or any model. It only models measurements and computes
 * deterministic, side-effect-free helpers.
 *
 * Thresholds for back-pressure are intentionally NOT defined here. See
 * `costThresholds.ts` — every limit is a TBD marker until real measurements
 * exist.
 */

export type CostDomain = "db_refresh" | "llm_prompt" | "ingest_rate";

/** Status of a measured operation. */
export type MeasurementStatus = "success" | "error";

/** Reason an AI Doctor prompt was assembled from raw history instead of a summary. */
export type RawHistoryFallbackState =
  | "summary_fresh"
  | "summary_stale"
  | "summary_missing"
  | "summary_error";

/** Source of a sensor reading for ingest-rate accounting. */
export type IngestReadingSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

// ---------------------------------------------------------------------------
// DB refresh measurement
// ---------------------------------------------------------------------------

export interface WindowRefreshMeasurement {
  readonly domain: "db_refresh";
  /** Logical name, e.g. "tent_environment_5m" or "ai_doctor_context_window". */
  readonly refreshName: string;
  /** Wall-clock duration of the refresh itself. */
  readonly durationMs: number;
  /** Time the refresh waited in a queue before starting (0 if none). */
  readonly queueWaitMs: number;
  /** Number of new rows the refresh observed since the previous run. */
  readonly deltaRowCount: number;
  /** Rows read by the refresh, if known by the caller. */
  readonly rowsRead?: number;
  /** Rows written/upserted by the refresh, if known by the caller. */
  readonly rowsWritten?: number;
  readonly status: MeasurementStatus;
  readonly errorCode?: string;
  /** ISO-8601 timestamp the measurement was recorded. */
  readonly recordedAt: string;
}

/** Keys that may NEVER appear on a db_refresh measurement. */
const FORBIDDEN_DB_REFRESH_KEYS = [
  "promptTokens",
  "completionTokens",
  "providerReportedTokens",
  "summaryByteSize",
  "rawHistoryFallback",
  "providerName",
] as const;

// ---------------------------------------------------------------------------
// AI prompt measurement
// ---------------------------------------------------------------------------

export interface AiDoctorPromptMeasurement {
  readonly domain: "llm_prompt";
  /** Logical prompt name, e.g. "ai_doctor_review" or "ai_coach_followup". */
  readonly promptName: string;
  /** Size in bytes of the assembled context summary fed to the model. */
  readonly summaryByteSize: number;
  /** Caller-side token estimate (may be null when no estimator is available). */
  readonly estimatedPromptTokens: number | null;
  /** Provider-reported token usage when the response includes it. */
  readonly providerReportedTokens: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  } | null;
  /** Whether the prompt fell back to raw history vs. a fresh summary. */
  readonly rawHistoryFallback: RawHistoryFallbackState;
  readonly status: MeasurementStatus;
  readonly errorCode?: string;
  readonly recordedAt: string;
}

/** Keys that may NEVER appear on an llm_prompt measurement. */
const FORBIDDEN_LLM_PROMPT_KEYS = [
  "durationMs",
  "queueWaitMs",
  "deltaRowCount",
  "rowsRead",
  "rowsWritten",
  "refreshName",
] as const;

// ---------------------------------------------------------------------------
// Ingest cadence measurement
// ---------------------------------------------------------------------------

export interface IngestRateMeasurement {
  readonly domain: "ingest_rate";
  readonly gardenId: string | null;
  readonly tentId: string | null;
  readonly source: IngestReadingSource;
  /** Window the rates below describe. ISO-8601 instant. */
  readonly observedAt: string;
  readonly readingsPer1m: number;
  readonly readingsPer5m: number;
  readonly readingsPer1h: number;
  readonly readingsPer24h: number;
}

// ---------------------------------------------------------------------------
// Domain guards
// ---------------------------------------------------------------------------

export interface CrossDomainViolation {
  readonly offendingKey: string;
  readonly expectedDomain: CostDomain;
}

/**
 * Returns the list of forbidden keys present on the given record.
 * A DB-refresh measurement must not carry token/prompt fields, and an
 * LLM-prompt measurement must not carry DB-refresh fields.
 */
export function detectCrossDomainViolations(
  domain: CostDomain,
  candidate: Readonly<Record<string, unknown>>,
): readonly CrossDomainViolation[] {
  const forbidden =
    domain === "db_refresh"
      ? FORBIDDEN_DB_REFRESH_KEYS
      : domain === "llm_prompt"
        ? FORBIDDEN_LLM_PROMPT_KEYS
        : [];
  const violations: CrossDomainViolation[] = [];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(candidate, key)) {
      violations.push({ offendingKey: key, expectedDomain: domain });
    }
  }
  return violations;
}

/**
 * Wraps a candidate as a validated WindowRefreshMeasurement. Throws if the
 * candidate carries forbidden LLM keys. Pure and deterministic.
 */
export function asWindowRefreshMeasurement(
  candidate: Readonly<Record<string, unknown>>,
): WindowRefreshMeasurement {
  const violations = detectCrossDomainViolations("db_refresh", candidate);
  if (violations.length > 0) {
    throw new Error(
      `WindowRefreshMeasurement rejected forbidden keys: ${violations
        .map((v) => v.offendingKey)
        .join(", ")}`,
    );
  }
  return candidate as unknown as WindowRefreshMeasurement;
}

export function asAiDoctorPromptMeasurement(
  candidate: Readonly<Record<string, unknown>>,
): AiDoctorPromptMeasurement {
  const violations = detectCrossDomainViolations("llm_prompt", candidate);
  if (violations.length > 0) {
    throw new Error(
      `AiDoctorPromptMeasurement rejected forbidden keys: ${violations
        .map((v) => v.offendingKey)
        .join(", ")}`,
    );
  }
  return candidate as unknown as AiDoctorPromptMeasurement;
}

// ---------------------------------------------------------------------------
// Cadence helper
// ---------------------------------------------------------------------------

export interface CadenceInput {
  readonly nowMs: number;
  readonly readingTimestampsMs: readonly number[];
}

export interface CadenceResult {
  readonly per1m: number;
  readonly per5m: number;
  readonly per1h: number;
  readonly per24h: number;
}

const WINDOW_1M = 60_000;
const WINDOW_5M = 5 * 60_000;
const WINDOW_1H = 60 * 60_000;
const WINDOW_24H = 24 * 60 * 60_000;

/**
 * Computes observed cadence (count of readings in each rolling window ending
 * at `nowMs`). Pure; sort-stable; treats timestamps strictly: a reading at
 * `nowMs - windowMs` is included, anything older is excluded.
 *
 * Out-of-range timestamps (future readings beyond nowMs, NaN, non-finite)
 * are ignored — never inflated, never silently treated as healthy.
 */
export function computeObservedCadence(input: CadenceInput): CadenceResult {
  const { nowMs, readingTimestampsMs } = input;
  let per1m = 0;
  let per5m = 0;
  let per1h = 0;
  let per24h = 0;
  for (const ts of readingTimestampsMs) {
    if (!Number.isFinite(ts)) continue;
    if (ts > nowMs) continue;
    const age = nowMs - ts;
    if (age < 0) continue;
    if (age <= WINDOW_1M) per1m += 1;
    if (age <= WINDOW_5M) per5m += 1;
    if (age <= WINDOW_1H) per1h += 1;
    if (age <= WINDOW_24H) per24h += 1;
  }
  return { per1m, per5m, per1h, per24h };
}

/**
 * Indicates whether a prompt assembly event represents elevated token-cost
 * risk. Raw-history fallback is the token-risk event because the model
 * receives unsummarized history, inflating prompt tokens.
 */
export function isTokenRiskEvent(state: RawHistoryFallbackState): boolean {
  return state !== "summary_fresh";
}

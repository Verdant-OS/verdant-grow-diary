/**
 * piIngestRateLimitRules — pure rate-limit and abuse-guard rules for the
 * future `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network. No storage.
 *  - Validation/decision only. Caller is responsible for tracking timestamps
 *    and enforcing the decision.
 *
 * This module decides allow/deny given:
 *   - a list of recent request timestamps (caller-provided)
 *   - a window
 *   - a per-window cap
 *   - a per-batch cap
 *
 * It never calls `Date.now()` directly — the current time is always injected.
 */

// ----------------------------- Types -----------------------------

export interface BridgeRateLimitInput {
  readonly bridgeId: string;
  readonly now: number;
  readonly recentRequestTimestamps: readonly number[];
  readonly windowMs: number;
  readonly maxRequestsPerWindow: number;
}

export interface BridgeBatchLimitInput {
  readonly bridgeId: string;
  readonly readingCount: number;
  readonly maxReadingsPerBatch: number;
}

export interface BridgeAbuseGuardInput
  extends BridgeRateLimitInput,
    Omit<BridgeBatchLimitInput, "bridgeId"> {}

export type BridgeRateLimitFailureCode =
  | "missing_bridge_id"
  | "invalid_now"
  | "invalid_window_ms"
  | "invalid_max_requests"
  | "rate_limited";

export type BridgeBatchLimitFailureCode =
  | "missing_bridge_id"
  | "invalid_reading_count"
  | "invalid_max_readings_per_batch"
  | "batch_too_large";

export type BridgeAbuseFailureCode =
  | BridgeRateLimitFailureCode
  | BridgeBatchLimitFailureCode;

export type BridgeRateLimitResult =
  | {
      readonly ok: true;
      readonly countInWindow: number;
      readonly remaining: number;
    }
  | {
      readonly ok: false;
      readonly code: BridgeRateLimitFailureCode;
      readonly message: string;
      readonly retryAfterMs?: number;
    };

export type BridgeBatchLimitResult =
  | { readonly ok: true; readonly readingCount: number }
  | {
      readonly ok: false;
      readonly code: BridgeBatchLimitFailureCode;
      readonly message: string;
    };

export interface BridgeAbuseFailure {
  readonly code: BridgeAbuseFailureCode;
  readonly message: string;
  readonly retryAfterMs?: number;
}

export type BridgeAbuseGuardResult =
  | {
      readonly ok: true;
      readonly countInWindow: number;
      readonly remaining: number;
      readonly readingCount: number;
    }
  | {
      readonly ok: false;
      readonly failures: readonly BridgeAbuseFailure[];
      readonly retryAfterMs?: number;
    };

// ----------------------------- Rate limit -----------------------------

export function evaluateBridgeRateLimit(
  input: BridgeRateLimitInput,
): BridgeRateLimitResult {
  const bridgeId = (input.bridgeId ?? "").trim();
  if (!bridgeId)
    return { ok: false, code: "missing_bridge_id", message: "bridgeId is required" };

  if (typeof input.now !== "number" || !Number.isFinite(input.now))
    return { ok: false, code: "invalid_now", message: "now must be a finite number" };

  if (
    typeof input.windowMs !== "number" ||
    !Number.isFinite(input.windowMs) ||
    input.windowMs <= 0
  )
    return {
      ok: false,
      code: "invalid_window_ms",
      message: "windowMs must be a positive finite number",
    };

  if (
    typeof input.maxRequestsPerWindow !== "number" ||
    !Number.isInteger(input.maxRequestsPerWindow) ||
    input.maxRequestsPerWindow <= 0
  )
    return {
      ok: false,
      code: "invalid_max_requests",
      message: "maxRequestsPerWindow must be a positive integer",
    };

  const windowStart = input.now - input.windowMs;
  // Read-only iteration; never mutate the caller's array.
  const inWindow: number[] = [];
  for (const t of input.recentRequestTimestamps) {
    if (typeof t === "number" && Number.isFinite(t) && t > windowStart && t <= input.now)
      inWindow.push(t);
  }
  const count = inWindow.length;

  if (count >= input.maxRequestsPerWindow) {
    // Oldest in-window timestamp expires at oldest + windowMs.
    const oldest = inWindow.reduce((a, b) => (a < b ? a : b));
    const retryAfterMs = Math.max(0, oldest + input.windowMs - input.now);
    return {
      ok: false,
      code: "rate_limited",
      message: `Rate limit exceeded: ${count}/${input.maxRequestsPerWindow} in window`,
      retryAfterMs,
    };
  }

  return {
    ok: true,
    countInWindow: count,
    remaining: input.maxRequestsPerWindow - count,
  };
}

// ----------------------------- Batch limit -----------------------------

export function evaluateBridgeBatchLimit(
  input: BridgeBatchLimitInput,
): BridgeBatchLimitResult {
  const bridgeId = (input.bridgeId ?? "").trim();
  if (!bridgeId)
    return { ok: false, code: "missing_bridge_id", message: "bridgeId is required" };

  if (
    typeof input.maxReadingsPerBatch !== "number" ||
    !Number.isInteger(input.maxReadingsPerBatch) ||
    input.maxReadingsPerBatch <= 0
  )
    return {
      ok: false,
      code: "invalid_max_readings_per_batch",
      message: "maxReadingsPerBatch must be a positive integer",
    };

  if (
    typeof input.readingCount !== "number" ||
    !Number.isInteger(input.readingCount) ||
    input.readingCount <= 0
  )
    return {
      ok: false,
      code: "invalid_reading_count",
      message: "readingCount must be a positive integer",
    };

  if (input.readingCount > input.maxReadingsPerBatch)
    return {
      ok: false,
      code: "batch_too_large",
      message: `Batch too large: ${input.readingCount} > ${input.maxReadingsPerBatch}`,
    };

  return { ok: true, readingCount: input.readingCount };
}

// ----------------------------- Abuse guard -----------------------------

export function evaluateBridgeAbuseGuard(
  input: BridgeAbuseGuardInput,
): BridgeAbuseGuardResult {
  const rate = evaluateBridgeRateLimit({
    bridgeId: input.bridgeId,
    now: input.now,
    recentRequestTimestamps: input.recentRequestTimestamps,
    windowMs: input.windowMs,
    maxRequestsPerWindow: input.maxRequestsPerWindow,
  });
  const batch = evaluateBridgeBatchLimit({
    bridgeId: input.bridgeId,
    readingCount: input.readingCount,
    maxReadingsPerBatch: input.maxReadingsPerBatch,
  });

  const failures: BridgeAbuseFailure[] = [];
  let retryAfterMs: number | undefined;

  if (rate.ok !== true) {
    const f: BridgeAbuseFailure = (rate as { retryAfterMs?: number }).retryAfterMs !== undefined
      ? { code: rate.code, message: rate.message, retryAfterMs: (rate as { retryAfterMs: number }).retryAfterMs }
      : { code: rate.code, message: rate.message };
    failures.push(f);
    if (f.retryAfterMs !== undefined) retryAfterMs = f.retryAfterMs;
  }
  if (batch.ok !== true) {
    failures.push({ code: batch.code, message: batch.message });
  }

  if (failures.length > 0) {
    return retryAfterMs !== undefined
      ? { ok: false, failures, retryAfterMs }
      : { ok: false, failures };
  }

  // Both branches are ok here.
  return {
    ok: true,
    countInWindow: (rate as { countInWindow: number }).countInWindow,
    remaining: (rate as { remaining: number }).remaining,
    readingCount: (batch as { readingCount: number }).readingCount,
  };
}

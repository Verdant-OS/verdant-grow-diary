/**
 * piIngestPipeline — pure end-to-end composer for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network. No writes.
 *  - Composes only the pure modules:
 *      verifyBridgeRequest
 *      validatePiIngestRequestEnvelope
 *      evaluateBridgeAbuseGuard
 *      toExternalSensorIngestPayload
 *      normalizeIngestPayload
 *      validateBridgeBatchScope
 *  - Returns a single discriminated result describing whether a future
 *    endpoint may proceed to write the normalized drafts, or why not.
 *  - `validateSensorReadingBatch` is intentionally NOT imported because it
 *    lives inside a hook module that pulls in React Query + Supabase.
 */

import {
  verifyBridgeRequest,
  type BridgeAuthRequest,
  type BridgeAuthResult,
  type BridgeCredential,
} from "./piIngestAuthRules";
import {
  validateBridgeBatchScope,
  type BridgeBatchScopeResult,
} from "./piIngestBridgeRules";
import {
  evaluateBridgeAbuseGuard,
  type BridgeAbuseGuardResult,
} from "./piIngestRateLimitRules";
import {
  toExternalSensorIngestPayload,
  validatePiIngestRequestEnvelope,
  type PiIngestRequestValidationResult,
} from "./piIngestRequestRules";
import {
  normalizeIngestPayload,
  type NormalizedSensorReadingDraft,
} from "./sensorIngestNormalizationRules";

// ----------------------------- Types -----------------------------

export interface PiIngestPipelineInput {
  readonly authRequest: BridgeAuthRequest;
  readonly credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>;
  readonly parsedBody: unknown;
  readonly rateLimit: {
    readonly recentRequestTimestamps: ReadonlyArray<string | number | Date>;
    readonly windowMs: number;
    readonly maxRequestsPerWindow: number;
    readonly maxReadingsPerBatch: number;
  };
  readonly now: string | number | Date;
}

export type PiIngestPipelineStage =
  | "auth"
  | "envelope"
  | "abuse_guard"
  | "normalization"
  | "batch_scope";

export interface PiIngestPipelineIssue {
  readonly stage: PiIngestPipelineStage;
  readonly code: string;
  readonly message: string;
  readonly index?: number;
  readonly retryAfterMs?: number;
}

export type PiIngestPipelineResult =
  | {
      readonly ok: true;
      readonly ownerUserId: string;
      readonly bridgeId: string;
      readonly tentId: string;
      readonly readingDrafts: readonly NormalizedSensorReadingDraft[];
      readonly idempotencyKeys: readonly string[];
    }
  | {
      readonly ok: false;
      readonly stage: PiIngestPipelineStage;
      readonly issues: readonly PiIngestPipelineIssue[];
      readonly retryAfterMs?: number;
    };

// ----------------------------- Helpers -----------------------------

function coerceMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function coerceTimestamps(
  values: ReadonlyArray<string | number | Date>,
): number[] {
  const out: number[] = [];
  for (const v of values) {
    const ms = coerceMs(v);
    if (Number.isFinite(ms)) out.push(ms);
  }
  return out;
}

// ----------------------------- Pipeline -----------------------------

export async function preparePiIngestReadings(
  input: PiIngestPipelineInput,
): Promise<PiIngestPipelineResult> {
  const nowMs = coerceMs(input.now);
  if (!Number.isFinite(nowMs)) {
    return {
      ok: false,
      stage: "auth",
      issues: [
        { stage: "auth", code: "invalid_now", message: "now is not a valid time" },
      ],
    };
  }

  // 1) Auth
  const authReq: BridgeAuthRequest = { ...input.authRequest, now: nowMs };
  const auth: BridgeAuthResult = await verifyBridgeRequest(
    authReq,
    input.credentials,
  );
  if (auth.ok !== true) {
    return {
      ok: false,
      stage: "auth",
      issues: [{ stage: "auth", code: auth.code, message: auth.message }],
    };
  }

  // 2) Envelope
  const envelope: PiIngestRequestValidationResult =
    validatePiIngestRequestEnvelope(input.parsedBody, {
      now: new Date(nowMs),
    });
  if (envelope.ok !== true) {
    return {
      ok: false,
      stage: "envelope",
      issues: envelope.issues.map((i) => ({
        stage: "envelope" as const,
        code: i.code,
        message: i.message,
        ...(i.index !== undefined ? { index: i.index } : {}),
      })),
    };
  }

  // Envelope tent_id must match the auth-bound tent_id.
  if (envelope.envelope.tent_id !== auth.tentId) {
    return {
      ok: false,
      stage: "envelope",
      issues: [
        {
          stage: "envelope",
          code: "tent_id_mismatch",
          message:
            "envelope tent_id does not match the tent authorized by the bridge credential",
        },
      ],
    };
  }

  // 3) Abuse guard (rate limit + batch size)
  const abuse: BridgeAbuseGuardResult = evaluateBridgeAbuseGuard({
    bridgeId: auth.bridgeId,
    now: nowMs,
    recentRequestTimestamps: coerceTimestamps(
      input.rateLimit.recentRequestTimestamps,
    ),
    windowMs: input.rateLimit.windowMs,
    maxRequestsPerWindow: input.rateLimit.maxRequestsPerWindow,
    readingCount: envelope.envelope.readings.length,
    maxReadingsPerBatch: input.rateLimit.maxReadingsPerBatch,
  });
  if (abuse.ok !== true) {
    const retryAfterMs = (abuse as { retryAfterMs?: number }).retryAfterMs;
    return {
      ok: false,
      stage: "abuse_guard",
      issues: abuse.failures.map((f) => ({
        stage: "abuse_guard" as const,
        code: f.code,
        message: f.message,
        ...(f.retryAfterMs !== undefined ? { retryAfterMs: f.retryAfterMs } : {}),
      })),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }

  // 4) Adapter + 5) Normalization
  const adapter = toExternalSensorIngestPayload(envelope.envelope);
  const normalized = normalizeIngestPayload(adapter, { now: new Date(nowMs) });
  if (normalized.ok !== true) {
    return {
      ok: false,
      stage: "normalization",
      issues: normalized.errors.map((message) => ({
        stage: "normalization" as const,
        code: "normalization_error",
        message,
      })),
    };
  }

  // 6) Batch scope (credential authority + idempotency keys)
  const scope: BridgeBatchScopeResult = validateBridgeBatchScope(
    {
      bridgeId: auth.bridgeId,
      readings: envelope.envelope.readings.map((r) => ({
        tentId: envelope.envelope.tent_id,
        deviceId: envelope.envelope.device_id,
        metric: r.metric,
        capturedAt: envelope.envelope.captured_at,
      })),
    },
    input.credentials,
  );
  if (scope.ok !== true) {
    return {
      ok: false,
      stage: "batch_scope",
      issues: [
        {
          stage: "batch_scope",
          code: scope.code,
          message: scope.message,
          ...(scope.index !== undefined ? { index: scope.index } : {}),
        },
      ],
    };
  }

  return {
    ok: true,
    ownerUserId: auth.ownerUserId,
    bridgeId: auth.bridgeId,
    tentId: auth.tentId,
    readingDrafts: normalized.rows,
    idempotencyKeys: scope.keys,
  };
}

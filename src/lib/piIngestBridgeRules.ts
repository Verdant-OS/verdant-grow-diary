/**
 * piIngestBridgeRules — pure bridge credential resolution and idempotency-key
 * rules for the future `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network.
 *  - No writes. No schema knowledge. No elevated keys.
 *  - Returns validation results only. Caller decides what to do next,
 *    behind its own auth + persistence gates.
 *
 * This module ensures a future endpoint cannot accidentally:
 *  - accept a bridge for the wrong tent
 *  - accept duplicate readings inside the same batch
 *  - generate unstable idempotency keys
 *  - trust client-provided user_id
 *  - write before validation
 */

import type { BridgeCredential } from "./piIngestAuthRules";

export type { BridgeCredential };

// ----------------------------- Types -----------------------------

export interface ReadingIdentityInput {
  readonly bridgeId: string;
  readonly tentId: string;
  readonly deviceId: string | null | undefined;
  readonly metric: string | null | undefined;
  readonly capturedAt: string | null | undefined;
}

export interface BridgeBatchReading {
  readonly tentId: string;
  readonly deviceId: string | null | undefined;
  readonly metric: string | null | undefined;
  readonly capturedAt: string | null | undefined;
}

export interface BridgeBatchScopeInput {
  readonly bridgeId: string;
  readonly readings: readonly BridgeBatchReading[];
}

export type IdempotencyFailureCode =
  | "missing_bridge_id"
  | "missing_tent_id"
  | "missing_device_id"
  | "missing_metric"
  | "missing_captured_at"
  | "invalid_captured_at";

export type IdempotencyKeyResult =
  | { readonly ok: true; readonly key: string }
  | {
      readonly ok: false;
      readonly code: IdempotencyFailureCode;
      readonly message: string;
    };

export type BridgeResolveFailureCode =
  | "missing_bridge_id"
  | "unknown_bridge_id"
  | "inactive_credential";

export type ResolveBridgeResult =
  | { readonly ok: true; readonly credential: BridgeCredential }
  | {
      readonly ok: false;
      readonly code: BridgeResolveFailureCode;
      readonly message: string;
    };

export type TentAuthorizationFailureCode =
  | "missing_tent_id"
  | "tent_not_allowed";

export type TentAuthorizationResult =
  | { readonly ok: true; readonly tentId: string }
  | {
      readonly ok: false;
      readonly code: TentAuthorizationFailureCode;
      readonly message: string;
    };

export type BatchScopeFailureCode =
  | BridgeResolveFailureCode
  | TentAuthorizationFailureCode
  | IdempotencyFailureCode
  | "duplicate_reading_in_batch"
  | "empty_batch";

export type BridgeBatchScopeResult =
  | {
      readonly ok: true;
      readonly bridgeId: string;
      readonly ownerUserId: string;
      readonly keys: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: BatchScopeFailureCode;
      readonly message: string;
      readonly index?: number;
    };

// ----------------------------- Helpers -----------------------------

function fail<C extends string>(
  code: C,
  message: string,
  index?: number,
): { ok: false; code: C; message: string; index?: number } {
  return index === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, index };
}

function resolveFromList(
  bridgeId: string,
  credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>,
): BridgeCredential | undefined {
  if (Array.isArray(credentials)) {
    return (credentials as readonly BridgeCredential[]).find(
      (c) => c.bridgeId === bridgeId,
    );
  }
  return (credentials as ReadonlyMap<string, BridgeCredential>).get(bridgeId);
}

/** Normalize an ISO 8601 timestamp to canonical UTC ISO form. */
function normalizeTimestamp(input: string): string | null {
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

// ----------------------------- Credential resolution -----------------------------

export function resolveBridgeCredential(
  bridgeId: string | null | undefined,
  credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>,
): ResolveBridgeResult {
  const id = (bridgeId ?? "").trim();
  if (!id) return fail("missing_bridge_id", "bridgeId is required");
  const cred = resolveFromList(id, credentials);
  if (!cred) return fail("unknown_bridge_id", "Unknown bridge id");
  if (!cred.isActive)
    return fail("inactive_credential", "Bridge credential is inactive");
  return { ok: true, credential: cred };
}

export function assertBridgeCanWriteTent(
  credential: BridgeCredential,
  tentId: string | null | undefined,
): TentAuthorizationResult {
  const id = (tentId ?? "").trim();
  if (!id) return fail("missing_tent_id", "tentId is required");
  if (!credential.allowedTentIds.includes(id))
    return fail("tent_not_allowed", "tentId is not allowed for this bridge");
  return { ok: true, tentId: id };
}

// ----------------------------- Idempotency key -----------------------------

/**
 * Derive a deterministic idempotency key for a single reading.
 *
 * Key shape (stable contract):
 *   pi:<bridgeId>:<tentId>:<deviceId>:<metric>:<isoCapturedAt>
 *
 * Excluded by design:
 *   - user_id (never trusted from client; resolved server-side from credential)
 *   - sensor value (would defeat dedup)
 *   - raw_payload (opaque; would defeat dedup)
 */
export function deriveReadingIdempotencyKey(
  input: ReadingIdentityInput,
): IdempotencyKeyResult {
  const bridgeId = (input.bridgeId ?? "").trim();
  if (!bridgeId) return fail("missing_bridge_id", "bridgeId is required");
  const tentId = (input.tentId ?? "").trim();
  if (!tentId) return fail("missing_tent_id", "tentId is required");
  const deviceId = (input.deviceId ?? "").trim();
  if (!deviceId) return fail("missing_device_id", "deviceId is required");
  const metric = (input.metric ?? "").trim();
  if (!metric) return fail("missing_metric", "metric is required");
  const capturedAtRaw = (input.capturedAt ?? "").trim();
  if (!capturedAtRaw)
    return fail("missing_captured_at", "captured_at is required");
  const iso = normalizeTimestamp(capturedAtRaw);
  if (!iso)
    return fail(
      "invalid_captured_at",
      "captured_at must be a valid ISO 8601 timestamp",
    );
  return { ok: true, key: `pi:${bridgeId}:${tentId}:${deviceId}:${metric}:${iso}` };
}

/**
 * Derive idempotency keys for every reading in a batch, in input order.
 * If any single reading is invalid, the whole batch fails.
 */
export function deriveBatchIdempotencyKeys(
  bridgeId: string,
  readings: readonly BridgeBatchReading[],
):
  | { readonly ok: true; readonly keys: readonly string[] }
  | {
      readonly ok: false;
      readonly code: IdempotencyFailureCode | "duplicate_reading_in_batch" | "empty_batch";
      readonly message: string;
      readonly index?: number;
    } {
  if (!readings || readings.length === 0)
    return fail("empty_batch", "readings batch is empty");
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const res = deriveReadingIdempotencyKey({
      bridgeId,
      tentId: r.tentId,
      deviceId: r.deviceId,
      metric: r.metric,
      capturedAt: r.capturedAt,
    });
    if (!res.ok) return fail(res.code, res.message, i);
    if (seen.has(res.key))
      return fail(
        "duplicate_reading_in_batch",
        `duplicate reading at index ${i}`,
        i,
      );
    seen.add(res.key);
    keys.push(res.key);
  }
  return { ok: true, keys };
}

// ----------------------------- Batch scope validation -----------------------------

/**
 * Full pre-write validation for a bridge batch:
 *  - resolves the credential
 *  - authorizes every tentId against allowedTentIds
 *  - derives deterministic idempotency keys
 *  - rejects duplicates within the batch
 *
 * This function performs no writes. The caller must still apply auth
 * (HMAC verification) and persistence gates separately.
 */
export function validateBridgeBatchScope(
  input: BridgeBatchScopeInput,
  credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>,
): BridgeBatchScopeResult {
  const resolved = resolveBridgeCredential(input.bridgeId, credentials);
  if (resolved.ok !== true) return resolved;
  const cred = resolved.credential;

  if (!input.readings || input.readings.length === 0)
    return { ok: false, code: "empty_batch", message: "readings batch is empty" };

  for (let i = 0; i < input.readings.length; i++) {
    const r = input.readings[i];
    const tentRes = assertBridgeCanWriteTent(cred, r.tentId);
    if (tentRes.ok !== true)
      return { ok: false, code: tentRes.code, message: tentRes.message, index: i };
  }

  const keys = deriveBatchIdempotencyKeys(cred.bridgeId, input.readings);
  if (keys.ok !== true) return keys;

  return {
    ok: true,
    bridgeId: cred.bridgeId,
    ownerUserId: cred.ownerUserId,
    keys: keys.keys,
  };
}


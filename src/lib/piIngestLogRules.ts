/**
 * piIngestLogRules — pure, PII-safe log shaping for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network. No writes.
 *  - Shapes a single structured log record per ingest attempt.
 *  - Never includes: raw payload, raw_payload, bridge secret, HMAC signature,
 *    client body, sensor values, executable commands.
 */

import type {
  PiIngestPipelineResult,
  PiIngestPipelineStage,
} from "./piIngestPipeline";
import type { PiIngestInsertPartitionSummary } from "./piIngestInsertPlanRules";

// ----------------------------- Types -----------------------------

export type PiIngestLogStage = PiIngestPipelineStage | "success";

export interface PiIngestAttemptLogRecord {
  readonly event: "pi_ingest_attempt";
  readonly stage: PiIngestLogStage;
  readonly ok: boolean;
  readonly bridgeId?: string;
  readonly tentId?: string;
  readonly ownerUserIdHash?: string;
  readonly total?: number;
  readonly toInsert?: number;
  readonly duplicates?: number;
  readonly rejectedCode?: string;
  readonly retryAfterMs?: number;
}

export interface ShapePiIngestAttemptLogInput {
  readonly result: PiIngestPipelineResult;
  readonly partitionSummary?: PiIngestInsertPartitionSummary;
}

// ----------------------------- Hashing -----------------------------

/**
 * Deterministic, dependency-free short hash for `ownerUserId`.
 *
 * Uses FNV-1a 64-bit (split into two 32-bit lanes) and returns a 16-char
 * lowercase hex string prefixed with `oid_`. This is a one-way short
 * fingerprint suitable for log correlation, NOT a cryptographic identifier.
 */
export function hashOwnerUserId(ownerUserId: string): string {
  if (typeof ownerUserId !== "string" || ownerUserId.length === 0) {
    throw new Error("hashOwnerUserId: ownerUserId must be a non-empty string");
  }
  // FNV-1a 32-bit, two lanes with different offsets for a 64-bit-ish output.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < ownerUserId.length; i++) {
    const c = ownerUserId.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `oid_${hex(h1)}${hex(h2)}`;
}

// ----------------------------- Sensitive-key redaction -----------------------------

const FORBIDDEN_KEYS = new Set<string>([
  "raw",
  "raw_payload",
  "rawPayload",
  "payload",
  "body",
  "signature",
  "hmac",
  "secret",
  "bridgeSecret",
  "bridge_secret",
  "token",
  "authorization",
  "value",
  "values",
  "readings",
  "command",
  "target_device",
  "device_command",
]);

/**
 * Defensive guard: strip any forbidden key if a caller passes through an
 * untrusted record. Always returns a fresh object containing only the
 * allowed log fields.
 */
export function redactPiIngestLogRecord(
  record: Record<string, unknown>,
): PiIngestAttemptLogRecord {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = v;
  }
  // Force event marker.
  out.event = "pi_ingest_attempt";
  return out as PiIngestAttemptLogRecord;
}

// ----------------------------- Shaping -----------------------------

function firstRetryAfterMs(
  result: Extract<PiIngestPipelineResult, { ok: false }>,
): number | undefined {
  if (result.retryAfterMs !== undefined) return result.retryAfterMs;
  for (const i of result.issues) {
    if (i.retryAfterMs !== undefined) return i.retryAfterMs;
  }
  return undefined;
}

export function shapePiIngestAttemptLog(
  input: ShapePiIngestAttemptLogInput,
): PiIngestAttemptLogRecord {
  const { result, partitionSummary } = input;
  if (result.ok === true) {
    const record: PiIngestAttemptLogRecord = {
      event: "pi_ingest_attempt",
      stage: "success",
      ok: true,
      bridgeId: result.bridgeId,
      tentId: result.tentId,
      ownerUserIdHash: hashOwnerUserId(result.ownerUserId),
      ...(partitionSummary
        ? {
            total: partitionSummary.total,
            toInsert: partitionSummary.toInsert,
            duplicates: partitionSummary.duplicates,
          }
        : {}),
    };
    return record;
  }
  const rejectedCode = result.issues[0]?.code ?? `${result.stage}_error`;
  const retryAfterMs = firstRetryAfterMs(result);
  const record: PiIngestAttemptLogRecord = {
    event: "pi_ingest_attempt",
    stage: result.stage,
    ok: false,
    rejectedCode,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
  return record;
}

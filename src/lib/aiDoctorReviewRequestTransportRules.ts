/**
 * aiDoctorReviewRequestTransportRules — transport-only envelope for an AI
 * Doctor request.
 *
 * The model context packet must stay separate from operational scope. A grow
 * UUID is needed by the server-side credit ledger, but it must never become
 * part of the prompt sent to an upstream model.
 *
 * Pure: no React, Supabase, network, or model calls.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TRANSPORT_NESTING_DEPTH = 16;
const MAX_TRANSPORT_VALUE_NODES = 2_000;

export interface AiDoctorReviewRequestEnvelope<TPacket> {
  packet: TPacket;
  /** Server-only credit/ownership scope. Never prompt context. */
  grow_id?: string;
  /** Server-only replay identity. Never prompt context or persisted diagnosis data. */
  idempotency_key: string;
}

export type AiDoctorReviewRequestEnvelopeBuildResult<TPacket> =
  | { ok: true; envelope: AiDoctorReviewRequestEnvelope<TPacket> }
  | { ok: false; reason: "invalid_idempotency_key" };

export type AiDoctorReviewIdempotencyKeyCreationResult =
  | { ok: true; key: string }
  | {
      ok: false;
      reason: "idempotency_key_generation_failed" | "invalid_idempotency_key";
    };

export interface ParsedAiDoctorReviewRequestEnvelope {
  /** Sanitized model-context packet; never contains top-level transport fields. */
  packet: Record<string, unknown>;
  /** Untrusted scope for the Edge Function to validate and ownership-check. */
  growId: unknown;
  /** Untrusted idempotency value for the Edge Function to validate. */
  idempotencyKey: unknown;
  format: "envelope" | "legacy";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

interface TransportFieldStripResult {
  value: unknown;
  exceededDepth: boolean;
  exceededNodeBudget: boolean;
}

/**
 * Turns an injected UUID generator into a validated request identity. Keeping
 * generation behind this seam makes request-lifecycle tests deterministic and
 * converts unavailable/invalid randomness into a typed, fail-closed result.
 */
export function createAiDoctorReviewIdempotencyKey(
  generate: () => unknown,
): AiDoctorReviewIdempotencyKeyCreationResult {
  let candidate: unknown;
  try {
    candidate = generate();
  } catch {
    return { ok: false, reason: "idempotency_key_generation_failed" };
  }

  return isUuid(candidate)
    ? { ok: true, key: candidate }
    : { ok: false, reason: "invalid_idempotency_key" };
}

/** Browser default for one UUID per grower-initiated logical request. */
export function newAiDoctorReviewIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Builds the current request envelope. Invalid/demo scope IDs are omitted so
 * they cannot produce a malformed grow UUID request; the server still fails
 * closed when a Free request has no valid, owned grow scope. An invalid replay
 * identity fails closed as a typed result and never reaches the network.
 */
export function buildAiDoctorReviewRequestEnvelope<TPacket>(
  packet: TPacket,
  growId?: unknown,
  idempotencyKey?: unknown,
): AiDoctorReviewRequestEnvelopeBuildResult<TPacket> {
  if (!isUuid(idempotencyKey)) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }

  return {
    ok: true,
    envelope: isUuid(growId)
      ? { packet, grow_id: growId, idempotency_key: idempotencyKey }
      : { packet, idempotency_key: idempotencyKey },
  };
}

/**
 * Removes request-transport metadata before model prompt assembly, including
 * maliciously nested copies. IDs are operational scope, never model context.
 * Nesting is bounded so an untrusted JSON request cannot exhaust the Edge
 * runtime before the credit RPC runs.
 */
function stripAiDoctorReviewRequestTransportFieldsBounded(
  value: unknown,
  remainingNodes: { value: number },
  depth = 0,
): TransportFieldStripResult {
  if (remainingNodes.value <= 0) {
    return { value: null, exceededDepth: false, exceededNodeBudget: true };
  }
  remainingNodes.value -= 1;
  if (depth > MAX_TRANSPORT_NESTING_DEPTH) {
    return { value: null, exceededDepth: true, exceededNodeBudget: false };
  }
  if (Array.isArray(value)) {
    let exceededDepth = false;
    let exceededNodeBudget = false;
    const items: unknown[] = [];
    for (const item of value) {
      const result = stripAiDoctorReviewRequestTransportFieldsBounded(
        item,
        remainingNodes,
        depth + 1,
      );
      exceededDepth ||= result.exceededDepth;
      exceededNodeBudget ||= result.exceededNodeBudget;
      items.push(result.value);
      if (exceededDepth || exceededNodeBudget) break;
    }
    return { value: items, exceededDepth, exceededNodeBudget };
  }
  if (!isPlainRecord(value)) {
    return { value, exceededDepth: false, exceededNodeBudget: false };
  }

  let exceededDepth = false;
  let exceededNodeBudget = false;
  const stripped: Record<string, unknown> = {};
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nestedValue = value[key];
    if (
      key === "grow_id" ||
      key === "growId" ||
      key === "idempotency_key" ||
      key === "idempotencyKey"
    ) {
      continue;
    }
    const result = stripAiDoctorReviewRequestTransportFieldsBounded(
      nestedValue,
      remainingNodes,
      depth + 1,
    );
    exceededDepth ||= result.exceededDepth;
    exceededNodeBudget ||= result.exceededNodeBudget;
    stripped[key] = result.value;
    if (exceededDepth || exceededNodeBudget) break;
  }
  return { value: stripped, exceededDepth, exceededNodeBudget };
}

export function stripAiDoctorReviewRequestTransportFields(value: unknown): unknown {
  return stripAiDoctorReviewRequestTransportFieldsBounded(value, {
    value: MAX_TRANSPORT_VALUE_NODES,
  }).value;
}

/**
 * Parses both the current envelope and the prior flat packet shape. Keeping
 * the legacy branch lets a deployed client fail safely during rollout while
 * ensuring both shapes remove operational fields before prompting.
 */
export function parseAiDoctorReviewRequestEnvelope(
  value: unknown,
): ParsedAiDoctorReviewRequestEnvelope | null {
  if (!isPlainRecord(value)) return null;

  const hasEnvelope = Object.prototype.hasOwnProperty.call(value, "packet");
  const rawPacket = hasEnvelope ? value.packet : value;
  if (!isPlainRecord(rawPacket)) return null;

  const stripped = stripAiDoctorReviewRequestTransportFieldsBounded(rawPacket, {
    value: MAX_TRANSPORT_VALUE_NODES,
  });
  if (stripped.exceededDepth || stripped.exceededNodeBudget || !isPlainRecord(stripped.value)) {
    return null;
  }

  return {
    packet: stripped.value,
    growId: value.grow_id ?? value.growId,
    idempotencyKey: value.idempotency_key ?? value.idempotencyKey,
    format: hasEnvelope ? "envelope" : "legacy",
  };
}

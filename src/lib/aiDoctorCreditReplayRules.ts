/**
 * Pure parsing rules for the AI Doctor credit-spend replay boundary.
 *
 * The provider orchestration must distinguish an in-flight same-key request
 * from a stranded resultless spend without trusting loosely shaped RPC data.
 * No network, database, React, or provider behavior belongs here.
 */

export const AI_DOCTOR_RESULT_PENDING_WINDOW_MS = 60_000;
export const AI_DOCTOR_SPEND_TIMESTAMP_FUTURE_SKEW_MS = 5_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcRecord = Record<string, unknown>;

export type AiDoctorCreditSpendDecision =
  | { kind: "fresh"; spendId: string }
  | { kind: "cached"; spendId: string; result: unknown }
  | { kind: "pending"; spendId: string }
  | { kind: "stale"; spendId: string }
  | { kind: "refunded" }
  | { kind: "denied" }
  | { kind: "conflict" }
  | { kind: "invalid" };

export type AiDoctorResultAttachmentDecision = "recorded" | "replayed" | "rejected" | "ambiguous";

function isRecord(value: unknown): value is RpcRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function hasCachedResult(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function readSpendAgeMs(value: RpcRecord, nowMs: number): number | null {
  if (
    typeof value.spend_age_ms === "number" &&
    Number.isFinite(value.spend_age_ms) &&
    value.spend_age_ms >= 0
  ) {
    return value.spend_age_ms;
  }

  const createdAtMs =
    typeof value.spend_created_at === "string" ? Date.parse(value.spend_created_at) : NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(createdAtMs)) return null;

  const fallbackAgeMs = nowMs - createdAtMs;
  if (fallbackAgeMs < -AI_DOCTOR_SPEND_TIMESTAMP_FUTURE_SKEW_MS) return null;
  return Math.max(0, fallbackAgeMs);
}

/**
 * Classifies a spend RPC response without validating the feature-specific
 * cached result. The Edge performs that contract validation before returning
 * a cached payload.
 */
export function classifyAiDoctorCreditSpend(
  value: unknown,
  nowMs: number,
): AiDoctorCreditSpendDecision {
  if (!isRecord(value)) return { kind: "invalid" };

  if (value.reason === "spend_refunded") return { kind: "refunded" };
  if (value.reason === "idempotency_key_conflict") return { kind: "conflict" };
  if (value.ok === false && value.status === "denied") return { kind: "denied" };
  if (value.ok !== true) return { kind: "invalid" };

  const spendId = asUuid(value.spend_id);

  if (value.status === "spent") {
    return spendId ? { kind: "fresh", spendId } : { kind: "invalid" };
  }

  if (value.status !== "replayed") return { kind: "invalid" };
  if (!spendId) return { kind: "invalid" };

  if (hasCachedResult(value.result)) {
    return { kind: "cached", spendId, result: value.result };
  }

  const ageMs = readSpendAgeMs(value, nowMs);
  if (ageMs !== null && ageMs < AI_DOCTOR_RESULT_PENDING_WINDOW_MS) {
    return { kind: "pending", spendId };
  }

  return { kind: "stale", spendId };
}

/** Accepts only the two service-RPC outcomes that prove the result is cached. */
export function parseAiDoctorResultAttachment(value: unknown): AiDoctorResultAttachmentDecision {
  if (!isRecord(value)) return "ambiguous";
  if (value.ok === true && (value.status === "recorded" || value.status === "replayed")) {
    return value.status;
  }
  if (
    value.ok === false &&
    value.status === "invalid" &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0
  ) {
    return "rejected";
  }
  return "ambiguous";
}

/** A first refund and an idempotent refund replay both prove no credit remains spent. */
export function isConfirmedAiDoctorCreditRefund(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.status === "refunded" || value.status === "replayed")
  );
}

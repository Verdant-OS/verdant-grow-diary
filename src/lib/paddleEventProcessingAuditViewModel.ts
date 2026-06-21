export type PaddleProcessingAuditStatus = "processed" | "ignored" | "blocked" | "failed";

export type PaddleProcessingAuditReason =
  | "not_authenticated"
  | "operator_required"
  | "event_not_verified"
  | "environment_not_allowed"
  | "event_type_mismatch"
  | "non_granting_transaction_event"
  | "adjustment_event_requires_policy"
  | "unsupported_event_type"
  | "unknown_price_id"
  | "ambiguous_price_ids"
  | "missing_customer_id"
  | "missing_subscription_id"
  | "processing_insert_failed";

export interface PaddleProcessingAuditCounts {
  processed: number;
  ignored: number;
  blocked: number;
  failed: number;
  total: number;
}

export interface PaddleProcessingAuditRow {
  processedAt: string | null;
  eventType: string;
  environment: string;
  status: PaddleProcessingAuditStatus;
  reason: PaddleProcessingAuditReason | null;
  reasonLabel: string;
  candidatePlanId: string | null;
  candidateStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isFounderCandidate: boolean;
}

export interface PaddleProcessingAuditViewModel {
  ok: boolean;
  reason: PaddleProcessingAuditReason | "unknown_response" | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  limit: number;
  counts: PaddleProcessingAuditCounts;
  latest: PaddleProcessingAuditRow[];
}

const DEFAULT_COUNTS: PaddleProcessingAuditCounts = {
  processed: 0,
  ignored: 0,
  blocked: 0,
  failed: 0,
  total: 0,
};

export const SAFE_REASON_LABELS: Record<PaddleProcessingAuditReason, string> = {
  not_authenticated: "Sign in required before viewing processing audit.",
  operator_required: "Operator role required.",
  event_not_verified: "Webhook signature was not verified.",
  environment_not_allowed: "Event environment is not allowed for this surface.",
  event_type_mismatch: "Recorded event type did not match payload event type.",
  non_granting_transaction_event: "Transaction event does not grant access.",
  adjustment_event_requires_policy: "Adjustment/refund event is waiting on policy.",
  unsupported_event_type: "Event type is not handled by the entitlement mapper.",
  unknown_price_id: "Price ID did not map to a known Verdant plan.",
  ambiguous_price_ids: "Multiple Verdant plans appeared in one event.",
  missing_customer_id: "Provider customer ID was missing.",
  missing_subscription_id: "Recurring event lacked an explicit subscription ID.",
  processing_insert_failed: "Processing audit insert failed and needs review.",
};

const STATUS_LABELS: Record<PaddleProcessingAuditStatus, string> = {
  processed: "Processed",
  ignored: "Ignored",
  blocked: "Blocked",
  failed: "Failed",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function asStatus(value: unknown): PaddleProcessingAuditStatus {
  return value === "processed" || value === "ignored" || value === "blocked" || value === "failed"
    ? value
    : "blocked";
}

function asReason(value: unknown): PaddleProcessingAuditReason | null {
  const candidate = asString(value);
  if (!candidate) return null;
  return candidate in SAFE_REASON_LABELS ? candidate as PaddleProcessingAuditReason : null;
}

export function formatPaddleProcessingStatus(status: PaddleProcessingAuditStatus): string {
  return STATUS_LABELS[status];
}

export function formatPaddleProcessingReason(reason: PaddleProcessingAuditReason | null): string {
  if (!reason) return "No issue recorded.";
  return SAFE_REASON_LABELS[reason] ?? "Reason recorded; label unavailable.";
}

export function formatPaddleProcessingPlan(planId: string | null): string {
  switch (planId) {
    case "pro_monthly":
      return "Pro Monthly";
    case "pro_annual":
      return "Pro Annual";
    case "founder_lifetime":
      return "Founder Lifetime";
    case "free":
      return "Free";
    case null:
      return "—";
    default:
      return "Unknown plan";
  }
}

export function parsePaddleProcessingAuditResponse(input: unknown): PaddleProcessingAuditViewModel {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: "Audit response was not recognized.",
      generatedAt: null,
      limit: 0,
      counts: DEFAULT_COUNTS,
      latest: [],
    };
  }

  const ok = input.ok === true;
  const topReason = asReason(input.reason) ?? (ok ? null : "unknown_response");
  const countsRaw = isRecord(input.counts) ? input.counts : {};
  const rowsRaw = Array.isArray(input.latest) ? input.latest : [];

  return {
    ok,
    reason: topReason,
    reasonLabel: topReason === "unknown_response"
      ? "Audit response was not recognized."
      : topReason
        ? formatPaddleProcessingReason(topReason)
        : null,
    generatedAt: asString(input.generated_at),
    limit: asNumber(input.limit),
    counts: {
      processed: asNumber(countsRaw.processed),
      ignored: asNumber(countsRaw.ignored),
      blocked: asNumber(countsRaw.blocked),
      failed: asNumber(countsRaw.failed),
      total: asNumber(countsRaw.total),
    },
    latest: rowsRaw.filter(isRecord).map((row) => {
      const status = asStatus(row.status);
      const reason = asReason(row.reason);
      return {
        processedAt: asString(row.processed_at),
        eventType: asString(row.event_type) ?? "unknown_event",
        environment: asString(row.environment) ?? "unknown_environment",
        status,
        reason,
        reasonLabel: formatPaddleProcessingReason(reason),
        candidatePlanId: asString(row.candidate_plan_id),
        candidateStatus: asString(row.candidate_status),
        currentPeriodEnd: asString(row.current_period_end),
        cancelAtPeriodEnd: asBoolean(row.cancel_at_period_end),
        isFounderCandidate: asBoolean(row.is_founder_candidate),
      };
    }),
  };
}

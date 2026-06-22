/**
 * Pure view-model for sanitized billing_subscription_update_operator_audit
 * responses. No Supabase calls, no fetch, no IO. Deterministic.
 *
 * Strict safety contract:
 *   - Only displays sanitized fields (status/reason/plan/status/timestamp).
 *   - Never surfaces provider IDs, payloads, raw_payload, details, or
 *     provider_price_id, even if a future server change accidentally
 *     returns them.
 */

export type BillingSubscriptionUpdateAuditStatus =
  | "created"
  | "updated"
  | "noop"
  | "blocked"
  | "failed"
  | "skipped";

export type BillingSubscriptionUpdateAuditPlanId =
  | "free"
  | "pro_monthly"
  | "pro_annual"
  | "founder_lifetime";

export type BillingSubscriptionUpdateAuditSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "paused"
  | "expired";

export interface BillingSubscriptionUpdateAuditCounts {
  created: number;
  updated: number;
  noop: number;
  blocked: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface BillingSubscriptionUpdateAuditRow {
  createdAt: string | null;
  resultStatus: BillingSubscriptionUpdateAuditStatus;
  resultStatusLabel: string;
  resultReason: string | null;
  resultReasonLabel: string;
  candidatePlanId: BillingSubscriptionUpdateAuditPlanId | null;
  candidatePlanLabel: string;
  candidateStatus: BillingSubscriptionUpdateAuditSubscriptionStatus | null;
  candidateStatusLabel: string;
  subscriptionStatus: BillingSubscriptionUpdateAuditSubscriptionStatus | null;
  subscriptionStatusLabel: string;
}

export interface BillingSubscriptionUpdateAuditViewModel {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  limit: number;
  counts: BillingSubscriptionUpdateAuditCounts;
  countsSummary: string;
  latest: BillingSubscriptionUpdateAuditRow[];
}

const DEFAULT_COUNTS: BillingSubscriptionUpdateAuditCounts = {
  created: 0,
  updated: 0,
  noop: 0,
  blocked: 0,
  failed: 0,
  skipped: 0,
  total: 0,
};

const STATUS_LABELS: Record<BillingSubscriptionUpdateAuditStatus, string> = {
  created: "Created",
  updated: "Updated",
  noop: "No change",
  blocked: "Blocked",
  failed: "Failed",
  skipped: "Skipped",
};

const PLAN_LABELS: Record<BillingSubscriptionUpdateAuditPlanId, string> = {
  free: "Free",
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  founder_lifetime: "Founder Lifetime",
};

const SUBSCRIPTION_STATUS_LABELS: Record<BillingSubscriptionUpdateAuditSubscriptionStatus, string> = {
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  paused: "Paused",
  expired: "Expired",
};

const TOP_REASON_LABELS: Record<string, string> = {
  not_authenticated: "Sign in required before viewing the subscription update audit.",
  operator_required: "Operator role required.",
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

function asStatus(value: unknown): BillingSubscriptionUpdateAuditStatus {
  switch (value) {
    case "created":
    case "updated":
    case "noop":
    case "blocked":
    case "failed":
    case "skipped":
      return value;
    default:
      return "failed";
  }
}

function asPlan(value: unknown): BillingSubscriptionUpdateAuditPlanId | null {
  switch (value) {
    case "free":
    case "pro_monthly":
    case "pro_annual":
    case "founder_lifetime":
      return value;
    default:
      return null;
  }
}

function asSubStatus(value: unknown): BillingSubscriptionUpdateAuditSubscriptionStatus | null {
  switch (value) {
    case "active":
    case "past_due":
    case "canceled":
    case "paused":
    case "expired":
      return value;
    default:
      return null;
  }
}

export function formatBillingSubscriptionUpdateAuditStatus(
  status: BillingSubscriptionUpdateAuditStatus,
): string {
  return STATUS_LABELS[status];
}

export function formatBillingSubscriptionUpdateAuditPlan(
  plan: BillingSubscriptionUpdateAuditPlanId | null,
): string {
  return plan ? PLAN_LABELS[plan] : "—";
}

export function formatBillingSubscriptionUpdateAuditSubscriptionStatus(
  status: BillingSubscriptionUpdateAuditSubscriptionStatus | null,
): string {
  return status ? SUBSCRIPTION_STATUS_LABELS[status] : "—";
}

export function formatBillingSubscriptionUpdateAuditReason(reason: string | null): string {
  if (!reason) return "No reason recorded.";
  return reason;
}

export function formatBillingSubscriptionUpdateAuditCountsSummary(
  counts: BillingSubscriptionUpdateAuditCounts,
): string {
  return [
    `Created ${counts.created}`,
    `Updated ${counts.updated}`,
    `No change ${counts.noop}`,
    `Blocked ${counts.blocked}`,
    `Failed ${counts.failed}`,
    `Skipped ${counts.skipped}`,
    `Total ${counts.total}`,
  ].join(" · ");
}

export function parseBillingSubscriptionUpdateAuditResponse(
  input: unknown,
): BillingSubscriptionUpdateAuditViewModel {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: "Audit response was not recognized.",
      generatedAt: null,
      limit: 0,
      counts: DEFAULT_COUNTS,
      countsSummary: formatBillingSubscriptionUpdateAuditCountsSummary(DEFAULT_COUNTS),
      latest: [],
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const reasonLabel = reason
    ? TOP_REASON_LABELS[reason] ?? "Audit reason recorded; label unavailable."
    : null;

  const countsRaw = isRecord(input.counts) ? input.counts : {};
  const counts: BillingSubscriptionUpdateAuditCounts = {
    created: asNumber(countsRaw.created),
    updated: asNumber(countsRaw.updated),
    noop: asNumber(countsRaw.noop),
    blocked: asNumber(countsRaw.blocked),
    failed: asNumber(countsRaw.failed),
    skipped: asNumber(countsRaw.skipped),
    total: asNumber(countsRaw.total),
  };

  const rowsRaw = Array.isArray(input.latest) ? input.latest : [];
  const latest: BillingSubscriptionUpdateAuditRow[] = rowsRaw
    .filter(isRecord)
    .map((row) => {
      const resultStatus = asStatus(row.result_status);
      const resultReason = asString(row.result_reason);
      const candidatePlanId = asPlan(row.candidate_plan_id);
      const candidateStatus = asSubStatus(row.candidate_status);
      const subscriptionStatus = asSubStatus(row.subscription_status);
      return {
        createdAt: asString(row.created_at),
        resultStatus,
        resultStatusLabel: formatBillingSubscriptionUpdateAuditStatus(resultStatus),
        resultReason,
        resultReasonLabel: formatBillingSubscriptionUpdateAuditReason(resultReason),
        candidatePlanId,
        candidatePlanLabel: formatBillingSubscriptionUpdateAuditPlan(candidatePlanId),
        candidateStatus,
        candidateStatusLabel: formatBillingSubscriptionUpdateAuditSubscriptionStatus(candidateStatus),
        subscriptionStatus,
        subscriptionStatusLabel:
          formatBillingSubscriptionUpdateAuditSubscriptionStatus(subscriptionStatus),
      };
    });

  return {
    ok,
    reason,
    reasonLabel,
    generatedAt: asString(input.generated_at),
    limit: asNumber(input.limit),
    counts,
    countsSummary: formatBillingSubscriptionUpdateAuditCountsSummary(counts),
    latest,
  };
}

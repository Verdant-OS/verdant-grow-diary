/**
 * Pure view-model for sanitized billing_entitlement_resolution_operator_audit
 * responses. No Supabase calls, no fetch, no IO. Deterministic.
 *
 * Strict safety contract:
 *   - Only displays sanitized fields (plan, subscription status, entitlement
 *     state, fallback reason, period presence, cancel flag, updated-at label).
 *   - Never surfaces raw provider identifiers, payloads, user IDs, emails,
 *     event/processing IDs, or other internal UUIDs — even if a future
 *     server change accidentally returns them. The forbidden field list
 *     lives in BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS and is
 *     asserted at compile time.
 */

export type BillingEntitlementResolutionAuditPlanId =
  | "free"
  | "pro_monthly"
  | "pro_annual"
  | "founder_lifetime";

export type BillingEntitlementResolutionAuditSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "paused"
  | "expired";

export type BillingEntitlementResolutionAuditState =
  | "active"
  | "free_fallback"
  | "expired_fallback"
  | "blocked"
  | "unknown";

export type BillingEntitlementResolutionAuditFallbackReason =
  | "unknown_plan_id"
  | "unknown_status"
  | "period_elapsed"
  | "expired"
  | "canceled"
  | "past_due"
  | "paused";

export interface BillingEntitlementResolutionAuditCounts {
  total: number;
  active: number;
  free_fallback: number;
  expired_fallback: number;
  blocked: number;
  unknown: number;
}

export type BillingEntitlementResolutionAuditOperatorRow = {
  readonly plan_id: BillingEntitlementResolutionAuditPlanId | null;
  readonly subscription_status:
    | BillingEntitlementResolutionAuditSubscriptionStatus
    | null;
  readonly effective_entitlement_state: BillingEntitlementResolutionAuditState;
  readonly fallback_reason: BillingEntitlementResolutionAuditFallbackReason | null;
  readonly cancel_at_period_end: boolean;
  readonly current_period_end_present: boolean;
  readonly updated_at: string | null;
};

export const BILLING_ENTITLEMENT_RESOLUTION_AUDIT_OPERATOR_ROW_KEYS = [
  "plan_id",
  "subscription_status",
  "effective_entitlement_state",
  "fallback_reason",
  "cancel_at_period_end",
  "current_period_end_present",
  "updated_at",
] as const satisfies ReadonlyArray<
  keyof BillingEntitlementResolutionAuditOperatorRow
>;

export const BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS = [
  "provider_customer_id",
  "provider_subscription_id",
  "provider_price_id",
  "payload",
  "raw_payload",
  "details",
  "event_id",
  "processing_id",
  "user_id",
  "email",
  "id",
] as const;

export type BillingEntitlementResolutionAuditForbiddenKey =
  typeof BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS[number];

type AssertNoForbiddenKeys<T> = Extract<
  keyof T,
  BillingEntitlementResolutionAuditForbiddenKey
> extends never
  ? true
  : never;

export interface BillingEntitlementResolutionAuditDisplayRow {
  planId: BillingEntitlementResolutionAuditPlanId | null;
  planLabel: string;
  subscriptionStatus:
    | BillingEntitlementResolutionAuditSubscriptionStatus
    | null;
  subscriptionStatusLabel: string;
  entitlementState: BillingEntitlementResolutionAuditState;
  entitlementStateLabel: string;
  fallbackReason: BillingEntitlementResolutionAuditFallbackReason | null;
  fallbackReasonLabel: string;
  aiCreditsPerMonthLabel: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEndPresent: boolean;
  updatedAtLabel: string;
}

const _assertSafeOperatorRow: AssertNoForbiddenKeys<BillingEntitlementResolutionAuditOperatorRow> = true;
const _assertSafeDisplayRow: AssertNoForbiddenKeys<BillingEntitlementResolutionAuditDisplayRow> = true;
void _assertSafeOperatorRow;
void _assertSafeDisplayRow;

export interface BillingEntitlementResolutionAuditViewModel {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  limit: number;
  counts: BillingEntitlementResolutionAuditCounts;
  countsSummary: string;
  latest: BillingEntitlementResolutionAuditDisplayRow[];
}

const DEFAULT_COUNTS: BillingEntitlementResolutionAuditCounts = {
  total: 0,
  active: 0,
  free_fallback: 0,
  expired_fallback: 0,
  blocked: 0,
  unknown: 0,
};

const PLAN_LABELS: Record<BillingEntitlementResolutionAuditPlanId, string> = {
  free: "Free",
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  founder_lifetime: "Founder Lifetime",
};

const SUBSCRIPTION_STATUS_LABELS: Record<
  BillingEntitlementResolutionAuditSubscriptionStatus,
  string
> = {
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  paused: "Paused",
  expired: "Expired",
};

const STATE_LABELS: Record<BillingEntitlementResolutionAuditState, string> = {
  active: "Active",
  free_fallback: "Free fallback",
  expired_fallback: "Expired fallback",
  blocked: "Blocked",
  unknown: "Unknown",
};

const FALLBACK_REASON_LABELS: Record<
  BillingEntitlementResolutionAuditFallbackReason,
  string
> = {
  unknown_plan_id: "Unknown plan id",
  unknown_status: "Unknown subscription status",
  period_elapsed: "Billing period elapsed",
  expired: "Subscription expired",
  canceled: "Subscription canceled",
  past_due: "Subscription past due",
  paused: "Subscription paused",
};

const AI_CREDITS_PER_MONTH: Record<
  BillingEntitlementResolutionAuditPlanId,
  number
> = {
  free: 0,
  pro_monthly: 100,
  pro_annual: 100,
  founder_lifetime: 100,
};

const TOP_REASON_LABELS: Record<string, string> = {
  not_authenticated:
    "Sign in required before viewing the entitlement resolution audit.",
  operator_required: "Operator role required.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asPlan(
  value: unknown,
): BillingEntitlementResolutionAuditPlanId | null {
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

function asSubStatus(
  value: unknown,
): BillingEntitlementResolutionAuditSubscriptionStatus | null {
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

function asState(value: unknown): BillingEntitlementResolutionAuditState {
  switch (value) {
    case "active":
    case "free_fallback":
    case "expired_fallback":
    case "blocked":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function asFallbackReason(
  value: unknown,
): BillingEntitlementResolutionAuditFallbackReason | null {
  switch (value) {
    case "unknown_plan_id":
    case "unknown_status":
    case "period_elapsed":
    case "expired":
    case "canceled":
    case "past_due":
    case "paused":
      return value;
    default:
      return null;
  }
}

export function formatBillingEntitlementResolutionPlan(
  plan: BillingEntitlementResolutionAuditPlanId | null,
): string {
  return plan ? PLAN_LABELS[plan] : "—";
}

export function formatBillingEntitlementResolutionSubscriptionStatus(
  status: BillingEntitlementResolutionAuditSubscriptionStatus | null,
): string {
  return status ? SUBSCRIPTION_STATUS_LABELS[status] : "—";
}

export function formatBillingEntitlementResolutionState(
  state: BillingEntitlementResolutionAuditState,
): string {
  return STATE_LABELS[state];
}

export function formatBillingEntitlementResolutionFallbackReason(
  reason: BillingEntitlementResolutionAuditFallbackReason | null,
): string {
  if (!reason) return "No fallback";
  return FALLBACK_REASON_LABELS[reason];
}

export function formatBillingEntitlementResolutionAiCreditsPerMonth(
  plan: BillingEntitlementResolutionAuditPlanId | null,
): string {
  if (!plan) return "—";
  return `${AI_CREDITS_PER_MONTH[plan]} / month`;
}

export function formatBillingEntitlementResolutionUpdatedAt(
  row: BillingEntitlementResolutionAuditOperatorRow,
): string {
  if (row.updated_at) return row.updated_at;
  if (row.current_period_end_present) return "Cycle on file";
  return "—";
}

export function formatBillingEntitlementResolutionCountsSummary(
  counts: BillingEntitlementResolutionAuditCounts,
): string {
  return [
    `Total ${counts.total}`,
    `Active ${counts.active}`,
    `Free fallback ${counts.free_fallback}`,
    `Expired fallback ${counts.expired_fallback}`,
    `Blocked ${counts.blocked}`,
    `Unknown ${counts.unknown}`,
  ].join(" · ");
}

export function parseBillingEntitlementResolutionAuditResponse(
  input: unknown,
): BillingEntitlementResolutionAuditViewModel {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: "Audit response was not recognized.",
      generatedAt: null,
      limit: 0,
      counts: DEFAULT_COUNTS,
      countsSummary: formatBillingEntitlementResolutionCountsSummary(DEFAULT_COUNTS),
      latest: [],
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const reasonLabel = reason
    ? TOP_REASON_LABELS[reason] ?? "Audit reason recorded; label unavailable."
    : null;

  const countsRaw = isRecord(input.counts) ? input.counts : {};
  const counts: BillingEntitlementResolutionAuditCounts = {
    total: asNumber(countsRaw.total),
    active: asNumber(countsRaw.active),
    free_fallback: asNumber(countsRaw.free_fallback),
    expired_fallback: asNumber(countsRaw.expired_fallback),
    blocked: asNumber(countsRaw.blocked),
    unknown: asNumber(countsRaw.unknown),
  };

  const rowsRaw = Array.isArray(input.latest) ? input.latest : [];
  const latest: BillingEntitlementResolutionAuditDisplayRow[] = rowsRaw
    .filter(isRecord)
    .map((row) => {
      // Explicit allow-list narrowing: we NEVER spread `row`. The sanitized
      // operator row contains only fields validated above.
      const operatorRow: BillingEntitlementResolutionAuditOperatorRow = {
        plan_id: asPlan(row.plan_id),
        subscription_status: asSubStatus(row.subscription_status),
        effective_entitlement_state: asState(row.effective_entitlement_state),
        fallback_reason: asFallbackReason(row.fallback_reason),
        cancel_at_period_end: asBool(row.cancel_at_period_end),
        current_period_end_present: asBool(row.current_period_end_present),
        updated_at: asString(row.updated_at),
      } satisfies BillingEntitlementResolutionAuditOperatorRow;

      const displayRow: BillingEntitlementResolutionAuditDisplayRow = {
        planId: operatorRow.plan_id,
        planLabel: formatBillingEntitlementResolutionPlan(operatorRow.plan_id),
        subscriptionStatus: operatorRow.subscription_status,
        subscriptionStatusLabel:
          formatBillingEntitlementResolutionSubscriptionStatus(
            operatorRow.subscription_status,
          ),
        entitlementState: operatorRow.effective_entitlement_state,
        entitlementStateLabel: formatBillingEntitlementResolutionState(
          operatorRow.effective_entitlement_state,
        ),
        fallbackReason: operatorRow.fallback_reason,
        fallbackReasonLabel: formatBillingEntitlementResolutionFallbackReason(
          operatorRow.fallback_reason,
        ),
        aiCreditsPerMonthLabel:
          formatBillingEntitlementResolutionAiCreditsPerMonth(
            operatorRow.plan_id,
          ),
        cancelAtPeriodEnd: operatorRow.cancel_at_period_end,
        currentPeriodEndPresent: operatorRow.current_period_end_present,
        updatedAtLabel: formatBillingEntitlementResolutionUpdatedAt(operatorRow),
      } satisfies BillingEntitlementResolutionAuditDisplayRow;
      return displayRow;
    });

  return {
    ok,
    reason,
    reasonLabel,
    generatedAt: asString(input.generated_at),
    limit: asNumber(input.limit),
    counts,
    countsSummary: formatBillingEntitlementResolutionCountsSummary(counts),
    latest,
  };
}

export type BillingCustomerLinkAuditStatus = "linked" | "pending_review" | "blocked" | "inactive";
export type BillingCustomerLinkAuditSource = "checkout" | "webhook" | "operator" | "import" | "unknown";
export type BillingCustomerLinkAuditConfidence = "verified" | "review_required" | "blocked";
export type BillingCustomerLinkAuditReason = "not_authenticated" | "operator_required";

export interface BillingCustomerLinkAuditCounts {
  total: number;
  linked: number;
  pendingReview: number;
  blocked: number;
  inactive: number;
  verified: number;
  reviewRequired: number;
  blockedConfidence: number;
}

export interface BillingCustomerLinkAuditRow {
  createdAt: string | null;
  updatedAt: string | null;
  provider: string;
  linkStatus: BillingCustomerLinkAuditStatus;
  linkStatusLabel: string;
  linkSource: BillingCustomerLinkAuditSource;
  linkSourceLabel: string;
  confidence: BillingCustomerLinkAuditConfidence;
  confidenceLabel: string;
  hasCustomerId: boolean;
  hasSubscriptionId: boolean;
  hasCheckoutId: boolean;
  hasEventReference: boolean;
}

export interface BillingCustomerLinkAuditViewModel {
  ok: boolean;
  reason: BillingCustomerLinkAuditReason | "unknown_response" | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  limit: number;
  counts: BillingCustomerLinkAuditCounts;
  latest: BillingCustomerLinkAuditRow[];
}

const DEFAULT_COUNTS: BillingCustomerLinkAuditCounts = {
  total: 0,
  linked: 0,
  pendingReview: 0,
  blocked: 0,
  inactive: 0,
  verified: 0,
  reviewRequired: 0,
  blockedConfidence: 0,
};

const SAFE_REASON_LABELS: Record<BillingCustomerLinkAuditReason, string> = {
  not_authenticated: "Sign in required before viewing link audit.",
  operator_required: "Operator role required.",
};

const STATUS_LABELS: Record<BillingCustomerLinkAuditStatus, string> = {
  linked: "Linked",
  pending_review: "Pending review",
  blocked: "Blocked",
  inactive: "Inactive",
};

const SOURCE_LABELS: Record<BillingCustomerLinkAuditSource, string> = {
  checkout: "Checkout",
  webhook: "Webhook",
  operator: "Operator",
  import: "Import",
  unknown: "Unknown",
};

const CONFIDENCE_LABELS: Record<BillingCustomerLinkAuditConfidence, string> = {
  verified: "Verified",
  review_required: "Review required",
  blocked: "Blocked",
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

function asStatus(value: unknown): BillingCustomerLinkAuditStatus {
  return value === "linked" || value === "pending_review" || value === "blocked" || value === "inactive"
    ? value
    : "blocked";
}

function asSource(value: unknown): BillingCustomerLinkAuditSource {
  return value === "checkout" || value === "webhook" || value === "operator" || value === "import" || value === "unknown"
    ? value
    : "unknown";
}

function asConfidence(value: unknown): BillingCustomerLinkAuditConfidence {
  return value === "verified" || value === "review_required" || value === "blocked"
    ? value
    : "blocked";
}

function asReason(value: unknown): BillingCustomerLinkAuditReason | null {
  const candidate = asString(value);
  return candidate === "not_authenticated" || candidate === "operator_required" ? candidate : null;
}

export function formatBillingCustomerLinkStatus(status: BillingCustomerLinkAuditStatus): string {
  return STATUS_LABELS[status];
}

export function formatBillingCustomerLinkSource(source: BillingCustomerLinkAuditSource): string {
  return SOURCE_LABELS[source];
}

export function formatBillingCustomerLinkConfidence(confidence: BillingCustomerLinkAuditConfidence): string {
  return CONFIDENCE_LABELS[confidence];
}

export function parseBillingCustomerLinkAuditResponse(input: unknown): BillingCustomerLinkAuditViewModel {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: "Link audit response was not recognized.",
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
      ? "Link audit response was not recognized."
      : topReason
        ? SAFE_REASON_LABELS[topReason]
        : null,
    generatedAt: asString(input.generated_at),
    limit: asNumber(input.limit),
    counts: {
      total: asNumber(countsRaw.total),
      linked: asNumber(countsRaw.linked),
      pendingReview: asNumber(countsRaw.pending_review),
      blocked: asNumber(countsRaw.blocked),
      inactive: asNumber(countsRaw.inactive),
      verified: asNumber(countsRaw.verified),
      reviewRequired: asNumber(countsRaw.review_required),
      blockedConfidence: asNumber(countsRaw.blocked_confidence),
    },
    latest: rowsRaw.filter(isRecord).map((row) => {
      const status = asStatus(row.link_status);
      const source = asSource(row.link_source);
      const confidence = asConfidence(row.confidence);
      return {
        createdAt: asString(row.created_at),
        updatedAt: asString(row.updated_at),
        provider: asString(row.provider) === "paddle" ? "paddle" : "unknown_provider",
        linkStatus: status,
        linkStatusLabel: formatBillingCustomerLinkStatus(status),
        linkSource: source,
        linkSourceLabel: formatBillingCustomerLinkSource(source),
        confidence,
        confidenceLabel: formatBillingCustomerLinkConfidence(confidence),
        hasCustomerId: asBoolean(row.has_customer_id),
        hasSubscriptionId: asBoolean(row.has_subscription_id),
        hasCheckoutId: asBoolean(row.has_checkout_id),
        hasEventReference: asBoolean(row.has_event_reference),
      };
    }),
  };
}

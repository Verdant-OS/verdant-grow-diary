export type BillingCustomerLinkProvider = "paddle";
export type BillingCustomerLinkStatus = "linked" | "pending_review" | "blocked" | "inactive";
export type BillingCustomerLinkSource = "checkout" | "webhook" | "operator" | "import" | "unknown";
export type BillingCustomerLinkConfidence = "verified" | "review_required" | "blocked";

export type BillingCustomerLinkBlockReason =
  | "missing_user_id"
  | "unsupported_provider"
  | "missing_provider_customer_id"
  | "ambiguous_provider_customer_id"
  | "ambiguous_provider_subscription_id"
  | "ambiguous_provider_checkout_id"
  | "ambiguous_event_reference"
  | "invalid_link_source"
  | "invalid_confidence"
  | "invalid_link_status";

export interface TrustedBillingCustomerLinkCaptureInput {
  authenticatedUserId?: unknown;
  provider?: unknown;
  providerCustomerId?: unknown;
  providerCustomerIds?: unknown;
  providerSubscriptionId?: unknown;
  providerSubscriptionIds?: unknown;
  providerCheckoutId?: unknown;
  providerCheckoutIds?: unknown;
  lastPaddleEventId?: unknown;
  lastPaddleEventIds?: unknown;
  linkSource?: unknown;
  linkStatus?: unknown;
  confidence?: unknown;
}

export interface BillingCustomerLinkInsertPayload {
  user_id: string;
  provider: BillingCustomerLinkProvider;
  provider_customer_id: string;
  provider_subscription_id: string | null;
  provider_checkout_id: string | null;
  link_status: BillingCustomerLinkStatus;
  link_source: BillingCustomerLinkSource;
  confidence: BillingCustomerLinkConfidence;
  last_paddle_event_id: string | null;
}

export interface BillingCustomerLinkCapturePlan {
  ok: true;
  payload: BillingCustomerLinkInsertPayload;
  conflictTarget: "provider,provider_customer_id";
}

export interface BillingCustomerLinkCaptureBlocked {
  ok: false;
  reason: BillingCustomerLinkBlockReason;
}

export type BillingCustomerLinkCaptureResult =
  | BillingCustomerLinkCapturePlan
  | BillingCustomerLinkCaptureBlocked;

const ALLOWED_SOURCES = new Set<BillingCustomerLinkSource>([
  "checkout",
  "webhook",
  "operator",
  "import",
  "unknown",
]);

const ALLOWED_STATUSES = new Set<BillingCustomerLinkStatus>([
  "linked",
  "pending_review",
  "blocked",
  "inactive",
]);

const ALLOWED_CONFIDENCE = new Set<BillingCustomerLinkConfidence>([
  "verified",
  "review_required",
  "blocked",
]);

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const item of value) {
    const cleaned = cleanString(item);
    if (cleaned) out.add(cleaned);
  }
  return [...out];
}

function oneExplicitString(
  single: unknown,
  many: unknown,
  ambiguousReason: BillingCustomerLinkBlockReason,
): { ok: true; value: string | null } | { ok: false; reason: BillingCustomerLinkBlockReason } {
  const values = new Set<string>();
  const singleCleaned = cleanString(single);
  if (singleCleaned) values.add(singleCleaned);
  for (const item of cleanStringArray(many)) values.add(item);

  if (values.size > 1) return { ok: false, reason: ambiguousReason };
  return { ok: true, value: [...values][0] ?? null };
}

function parseSource(value: unknown): BillingCustomerLinkSource | null {
  const cleaned = cleanString(value);
  if (!cleaned) return "unknown";
  return ALLOWED_SOURCES.has(cleaned as BillingCustomerLinkSource)
    ? cleaned as BillingCustomerLinkSource
    : null;
}

function parseStatus(value: unknown): BillingCustomerLinkStatus | null {
  const cleaned = cleanString(value);
  if (!cleaned) return "linked";
  return ALLOWED_STATUSES.has(cleaned as BillingCustomerLinkStatus)
    ? cleaned as BillingCustomerLinkStatus
    : null;
}

function parseConfidence(value: unknown): BillingCustomerLinkConfidence | null {
  const cleaned = cleanString(value);
  if (!cleaned) return "verified";
  return ALLOWED_CONFIDENCE.has(cleaned as BillingCustomerLinkConfidence)
    ? cleaned as BillingCustomerLinkConfidence
    : null;
}

function block(reason: BillingCustomerLinkBlockReason): BillingCustomerLinkCaptureBlocked {
  return { ok: false, reason };
}

export function buildBillingCustomerLinkCapturePlan(
  input: TrustedBillingCustomerLinkCaptureInput,
): BillingCustomerLinkCaptureResult {
  const userId = cleanString(input.authenticatedUserId);
  if (!userId) return block("missing_user_id");

  const provider = cleanString(input.provider) ?? "paddle";
  if (provider !== "paddle") return block("unsupported_provider");

  const customer = oneExplicitString(
    input.providerCustomerId,
    input.providerCustomerIds,
    "ambiguous_provider_customer_id",
  );
  if (customer.ok === false) return block(customer.reason);
  if (!customer.value) return block("missing_provider_customer_id");

  const subscription = oneExplicitString(
    input.providerSubscriptionId,
    input.providerSubscriptionIds,
    "ambiguous_provider_subscription_id",
  );
  if (subscription.ok === false) return block(subscription.reason);

  const checkout = oneExplicitString(
    input.providerCheckoutId,
    input.providerCheckoutIds,
    "ambiguous_provider_checkout_id",
  );
  if (checkout.ok === false) return block(checkout.reason);

  const eventReference = oneExplicitString(
    input.lastPaddleEventId,
    input.lastPaddleEventIds,
    "ambiguous_event_reference",
  );
  if (eventReference.ok === false) return block(eventReference.reason);

  const linkSource = parseSource(input.linkSource);
  if (!linkSource) return block("invalid_link_source");

  const linkStatus = parseStatus(input.linkStatus);
  if (!linkStatus) return block("invalid_link_status");

  const confidence = parseConfidence(input.confidence);
  if (!confidence) return block("invalid_confidence");

  return {
    ok: true,
    conflictTarget: "provider,provider_customer_id",
    payload: {
      user_id: userId,
      provider: "paddle",
      provider_customer_id: customer.value,
      provider_subscription_id: subscription.value,
      provider_checkout_id: checkout.value,
      link_status: linkStatus,
      link_source: linkSource,
      confidence,
      last_paddle_event_id: eventReference.value,
    },
  };
}

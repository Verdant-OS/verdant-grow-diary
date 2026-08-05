// Best-effort order-confirmation email dispatch for the canonical
// payments-webhook lane. Never throws; a failure here must not block
// the audited webhook success path — Paddle must always see 200 for
// email issues, otherwise a broken recipient lookup would generate
// webhook-retry spam.
//
// Consumes the Paddle SDK's camelCased event (as returned by
// verifyWebhook / paddle.webhooks.unmarshal). Recipient email is derived
// from customData.userId via auth.admin.getUserById — the caller cannot
// influence the destination address.
//
// Returns a structured DispatchResult with a stable machine-readable
// `reason` code so the webhook handler can surface why an email was
// (or was not) sent, without ever escalating to a non-2xx HTTP response
// that would cause Paddle to requeue the underlying billing event.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

interface SdkEventLike {
  eventType?: string;
  data?: {
    id?: string;
    customerId?: string;
    customData?: { userId?: string; user_id?: string } | null;
    details?: {
      totals?: { grandTotal?: string | number; currencyCode?: string };
    } | null;
    currencyCode?: string;
    items?: Array<{
      price?: { name?: string; description?: string } | null;
      product?: { name?: string } | null;
    }> | null;
  };
}

const CONFIRMATION_EVENT_TYPES = new Set<string>(["transaction.completed"]);

interface DispatchDeps {
  supabaseUrl: string;
  serviceRoleKey: string;
  dashboardUrl?: string;
}

/**
 * Stable reason codes. All non-`sent` outcomes are logged but never
 * thrown and never cause the webhook to return a non-200 status.
 */
export type DispatchReason =
  | "sent"
  | "skipped:event_type_not_confirmable"
  | "skipped:missing_user_id"
  | "skipped:user_lookup_failed"
  | "skipped:user_not_found"
  | "skipped:user_has_no_email"
  | "skipped:send_non_2xx"
  | "skipped:dispatch_threw";

export interface DispatchResult {
  reason: DispatchReason;
  detail?: string;
}

function formatAmount(evt: SdkEventLike): string | undefined {
  const totals = evt.data?.details?.totals;
  const raw = totals?.grandTotal;
  const currency = totals?.currencyCode || evt.data?.currencyCode;
  if (raw == null) return undefined;
  const cents = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(cents)) return undefined;
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${amount} ${currency}` : amount;
}

function pickProductName(evt: SdkEventLike): string | undefined {
  const item = evt.data?.items?.[0];
  return item?.product?.name || item?.price?.name || undefined;
}

function pickUserId(evt: SdkEventLike): string | undefined {
  const cd = evt.data?.customData ?? undefined;
  return cd?.userId || cd?.user_id || undefined;
}

function logSkip(result: DispatchResult, evt: SdkEventLike): DispatchResult {
  // Single structured log line per outcome. `warn` (not `error`) so it
  // doesn't page — these are expected, non-retryable fallbacks.
  console.warn("order-confirmation email skipped", {
    reason: result.reason,
    detail: result.detail,
    eventType: evt.eventType,
    transactionId: evt.data?.id,
  });
  return result;
}

export async function maybeSendPurchaseConfirmation(
  evt: SdkEventLike,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  try {
    if (!evt?.eventType || !CONFIRMATION_EVENT_TYPES.has(evt.eventType)) {
      return logSkip({ reason: "skipped:event_type_not_confirmable", detail: evt?.eventType }, evt);
    }

    const userId = pickUserId(evt);
    if (!userId) {
      return logSkip({ reason: "skipped:missing_user_id" }, evt);
    }

    const supabase: SupabaseClient = createClient(deps.supabaseUrl, deps.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userRes: Awaited<ReturnType<typeof supabase.auth.admin.getUserById>>;
    try {
      userRes = await supabase.auth.admin.getUserById(userId);
    } catch (e) {
      return logSkip({ reason: "skipped:user_lookup_failed", detail: String(e) }, evt);
    }
    if (userRes.error) {
      return logSkip({ reason: "skipped:user_lookup_failed", detail: userRes.error.message }, evt);
    }
    if (!userRes.data?.user) {
      return logSkip({ reason: "skipped:user_not_found" }, evt);
    }
    const recipient = userRes.data.user.email;
    if (!recipient) {
      return logSkip({ reason: "skipped:user_has_no_email" }, evt);
    }
    const firstName = (userRes.data.user.user_metadata as Record<string, unknown> | undefined)
      ?.first_name as string | undefined;

    const templateData = {
      firstName,
      productName: pickProductName(evt) ?? "Verdant Grow Diary",
      amountFormatted: formatAmount(evt),
      orderId: evt.data?.id,
      dashboardUrl: deps.dashboardUrl ?? "https://verdantgrowdiary.com/dashboard",
    };

    const idempotencyKey = `order-confirm:${evt.data?.id ?? crypto.randomUUID()}`;

    const resp = await fetch(`${deps.supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deps.serviceRoleKey}`,
      },
      body: JSON.stringify({
        templateName: "order-confirmation",
        recipientEmail: recipient,
        idempotencyKey,
        templateData,
      }),
    });
    if (!resp.ok) {
      return logSkip({ reason: "skipped:send_non_2xx", detail: `status=${resp.status}` }, evt);
    }
    return { reason: "sent" };
  } catch (err) {
    return logSkip({ reason: "skipped:dispatch_threw", detail: String(err) }, evt);
  }
}

// Best-effort order-confirmation email dispatch for the canonical
// payments-webhook lane. Never throws; a failure here must not block
// the audited webhook success path.
//
// Consumes the Paddle SDK's camelCased event (as returned by
// verifyWebhook / paddle.webhooks.unmarshal). Recipient email is derived
// from customData.userId via auth.admin.getUserById — the caller cannot
// influence the destination address.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

const CONFIRMATION_EVENT_TYPES = new Set<string>(['transaction.completed']);

interface DispatchDeps {
  supabaseUrl: string;
  serviceRoleKey: string;
  dashboardUrl?: string;
}

function formatAmount(evt: SdkEventLike): string | undefined {
  const totals = evt.data?.details?.totals;
  const raw = totals?.grandTotal;
  const currency = totals?.currencyCode || evt.data?.currencyCode;
  if (raw == null) return undefined;
  const cents = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(cents)) return undefined;
  const amount = (cents / 100).toLocaleString('en-US', {
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

export async function maybeSendPurchaseConfirmation(
  evt: SdkEventLike,
  deps: DispatchDeps,
): Promise<void> {
  try {
    if (!evt?.eventType || !CONFIRMATION_EVENT_TYPES.has(evt.eventType)) return;
    const userId = pickUserId(evt);
    if (!userId) return;

    const supabase: SupabaseClient = createClient(
      deps.supabaseUrl,
      deps.serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !userRes?.user?.email) return;
    const recipient = userRes.user.email;
    const firstName =
      (userRes.user.user_metadata as Record<string, unknown> | undefined)?.first_name as
        | string
        | undefined;

    const templateData = {
      firstName,
      productName: pickProductName(evt) ?? 'Verdant Grow Diary',
      amountFormatted: formatAmount(evt),
      orderId: evt.data?.id,
      dashboardUrl: deps.dashboardUrl ?? 'https://verdantgrowdiary.com/dashboard',
    };

    const idempotencyKey = `order-confirm:${evt.data?.id ?? crypto.randomUUID()}`;

    const resp = await fetch(
      `${deps.supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.serviceRoleKey}`,
        },
        body: JSON.stringify({
          templateName: 'order-confirmation',
          recipientEmail: recipient,
          idempotencyKey,
          templateData,
        }),
      },
    );
    if (!resp.ok) {
      console.warn('order-confirmation email dispatch non-2xx', { status: resp.status });
    }
  } catch (err) {
    console.warn('order-confirmation email dispatch failed', { err: String(err) });
  }
}

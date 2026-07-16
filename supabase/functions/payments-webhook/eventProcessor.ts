/**
 * Pure event-processor helpers for the Lovable built-in Paddle webhook.
 *
 * Extracted from index.ts so we can unit-test:
 *   - user id + external id extraction rules
 *   - skip-reason semantics (no user id, unknown price/product id, unhandled type)
 *   - upsert row shape for subscription events
 *   - transaction event shape for founder_lifetime one-time purchases
 *
 * These helpers do NOT talk to Supabase or Paddle. index.ts wires them
 * to the service-role client. Keep pure to preserve testability and match
 * the workspace layering rule (business logic outside JSX / edge glue).
 */

// Local copy of PaddleEnv so this pure module never pulls the Deno-only
// shared util into the frontend typecheck graph (unit tests import it
// from src/test/**). The canonical export lives in ../_shared/paddle.ts.
export type PaddleEnv = 'sandbox' | 'live';

// The known human-readable price IDs we accept. Anything else is a config
// mistake (a product created outside create_product/create_price) and is
// skipped rather than written with a raw pri_/pro_ id.
export const KNOWN_PRICE_IDS: ReadonlyArray<string> = [
  'pro_monthly',
  'pro_annual',
  'founder_lifetime',
];

export type Decision =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'upsert_subscription'; row: SubscriptionUpsertRow }
  | { kind: 'update_subscription'; paddleSubscriptionId: string; patch: SubscriptionPatch }
  | { kind: 'record_lifetime'; row: SubscriptionUpsertRow }
  | { kind: 'upsert_customer'; row: CustomerUpsertRow };

export type SkipReason =
  | 'missing_user_id'
  | 'missing_price_external_id'
  | 'missing_product_external_id'
  | 'unknown_price_id'
  | 'missing_subscription_id'
  | 'missing_transaction_id'
  | 'missing_customer_id'
  | 'unhandled_event_type'
  | 'lifetime_price_only_for_transactions'
  | 'non_lifetime_transaction'
  | 'unknown_lifetime_price_id';

export interface SubscriptionUpsertRow {
  user_id: string;
  paddle_subscription_id: string;
  paddle_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scheduled_change_action: string | null;
  scheduled_change_at: string | null;
  environment: PaddleEnv;
  updated_at: string;
}

export interface SubscriptionPatch {
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scheduled_change_action: string | null;
  scheduled_change_at: string | null;
  environment: PaddleEnv;
  updated_at: string;
}

// Mirror row for the paddle_customers table (customer.created /
// customer.updated events). Not tied to auth.users — mapping to the
// app user happens via subscriptions.paddle_customer_id.
export interface CustomerUpsertRow {
  paddle_customer_id: string;
  environment: PaddleEnv;
  email: string | null;
  name: string | null;
  locale: string | null;
  status: string | null;
  updated_at: string;
}

// Loose shapes — the Paddle SDK returns camelCase but we defensively read.
interface EventLike {
  eventType?: string;
  data?: SubscriptionData | TransactionData;
}
interface SubscriptionData {
  id?: string;
  customerId?: string;
  status?: string;
  currentBillingPeriod?: { startsAt?: string; endsAt?: string } | null;
  scheduledChange?: { action?: string } | null;
  customData?: { userId?: string } | null;
  items?: Array<{
    price?: { id?: string; importMeta?: { externalId?: string } | null };
    product?: { id?: string; importMeta?: { externalId?: string } | null };
  }>;
}
interface TransactionData {
  id?: string;
  customerId?: string;
  subscriptionId?: string | null;
  status?: string;
  customData?: { userId?: string } | null;
  items?: Array<{
    price?: {
      id?: string;
      productId?: string;
      importMeta?: { externalId?: string } | null;
    };
  }>;
}

function firstItem(data: SubscriptionData | TransactionData) {
  return Array.isArray(data.items) && data.items.length > 0 ? data.items[0] : null;
}

export function decide(event: EventLike, env: PaddleEnv, now: Date): Decision {
  const type = event.eventType ?? '';
  const data = event.data ?? {};
  const nowIso = now.toISOString();

  // Subscription events → subscriptions table upsert / update.
  if (
    type === 'subscription.created' ||
    type === 'subscription.updated' ||
    type === 'subscription.activated'
  ) {
    const sub = data as SubscriptionData;
    const userId = sub.customData?.userId;
    if (!userId) return { kind: 'skip', reason: 'missing_user_id' };
    if (!sub.id) return { kind: 'skip', reason: 'missing_subscription_id' };

    const item = firstItem(sub);
    const priceExt = item?.price?.importMeta?.externalId;
    const productExt =
      (item as { product?: { importMeta?: { externalId?: string } | null } } | null)
        ?.product?.importMeta?.externalId;
    if (!priceExt) return { kind: 'skip', reason: 'missing_price_external_id' };
    if (!productExt) return { kind: 'skip', reason: 'missing_product_external_id' };
    if (!KNOWN_PRICE_IDS.includes(priceExt)) {
      return { kind: 'skip', reason: 'unknown_price_id' };
    }

    return {
      kind: 'upsert_subscription',
      row: {
        user_id: userId,
        paddle_subscription_id: sub.id,
        paddle_customer_id: sub.customerId ?? '',
        product_id: productExt,
        price_id: priceExt,
        status: sub.status ?? 'active',
        current_period_start: sub.currentBillingPeriod?.startsAt ?? null,
        current_period_end: sub.currentBillingPeriod?.endsAt ?? null,
        cancel_at_period_end: sub.scheduledChange?.action === 'cancel',
        environment: env,
        updated_at: nowIso,
      },
    };
  }

  if (type === 'subscription.canceled') {
    const sub = data as SubscriptionData;
    if (!sub.id) return { kind: 'skip', reason: 'missing_subscription_id' };
    return {
      kind: 'update_subscription',
      paddleSubscriptionId: sub.id,
      patch: {
        status: 'canceled',
        current_period_start: sub.currentBillingPeriod?.startsAt ?? null,
        current_period_end: sub.currentBillingPeriod?.endsAt ?? null,
        cancel_at_period_end: true,
        environment: env,
        updated_at: nowIso,
      },
    };
  }

  // Transaction completed → the ONLY path that records founder_lifetime.
  // Recurring plans (pro_monthly / pro_annual) come through subscription
  // events; the transaction event for those carries a `subscriptionId` and
  // is skipped here to avoid double-writes.
  //
  // NOTE: transaction.completed payloads frequently do NOT include
  // `price.importMeta.externalId` — the orchestrator resolves the Paddle
  // internal price id via the Paddle API before calling decide() and
  // mutates the event to fill it in. If it is still missing here, the
  // price cannot be identified reliably → skip as unknown_lifetime_price_id.
  if (type === 'transaction.completed') {
    const tx = data as TransactionData;
    if (tx.status && tx.status !== 'completed' && tx.status !== 'paid') {
      return { kind: 'skip', reason: 'non_lifetime_transaction' };
    }
    if (tx.subscriptionId) {
      // Recurring subscription payment — handled via subscription events.
      return { kind: 'skip', reason: 'non_lifetime_transaction' };
    }
    const item = firstItem(tx);
    const priceExt = item?.price?.importMeta?.externalId;
    if (!priceExt) return { kind: 'skip', reason: 'unknown_lifetime_price_id' };
    if (priceExt !== 'founder_lifetime') {
      return { kind: 'skip', reason: 'unknown_lifetime_price_id' };
    }
    const userId = tx.customData?.userId;
    if (!userId) return { kind: 'skip', reason: 'missing_user_id' };
    if (!tx.id) return { kind: 'skip', reason: 'missing_transaction_id' };
    // Synthesize a stable pseudo-subscription id from the transaction id so
    // lifetime rows share the subscriptions unique-key discipline and never
    // collide with real subscription rows.
    const pseudoSubId = `lifetime_${tx.id}`;
    return {
      kind: 'record_lifetime',
      row: {
        user_id: userId,
        paddle_subscription_id: pseudoSubId,
        paddle_customer_id: tx.customerId ?? '',
        product_id: 'founder_lifetime',
        price_id: 'founder_lifetime',
        status: 'active',
        current_period_start: nowIso,
        // NULL end = no expiry; matches the entitlement resolver's
        // "founder lifetime never expires" treatment.
        current_period_end: null,
        cancel_at_period_end: false,
        environment: env,
        updated_at: nowIso,
      },
    };
  }

  return { kind: 'skip', reason: 'unhandled_event_type' };
}

/**
 * If this is a `transaction.completed` event with no subscriptionId and no
 * `price.importMeta.externalId`, return the Paddle internal price id so the
 * orchestrator can resolve it via the Paddle API. Otherwise null (no lookup
 * needed).
 *
 * We do NOT run this lookup for subscription events — those payloads reliably
 * carry importMeta.externalId. We also skip it for recurring transactions
 * (`subscriptionId` present) since those get skipped as non_lifetime anyway.
 */
export function transactionPriceIdNeedingLookup(event: EventLike): string | null {
  if (event.eventType !== 'transaction.completed') return null;
  const data = (event.data ?? {}) as TransactionData;
  if (data.subscriptionId) return null;
  const item = firstItem(data);
  if (!item?.price) return null;
  const alreadyResolved = item.price.importMeta?.externalId;
  if (alreadyResolved) return null;
  return item.price.id ?? null;
}

/**
 * Mutate an event to attach a resolved price external id. Called by the
 * orchestrator after `transactionPriceIdNeedingLookup` returned a paddle
 * price id and the resolver produced an external id (which may be null if
 * the price is unknown to our catalog).
 */
export function attachResolvedPriceExternalId(event: EventLike, externalId: string | null): void {
  if (!event.data) return;
  const data = event.data as TransactionData;
  const item = firstItem(data);
  if (!item?.price) return;
  item.price.importMeta = { externalId: externalId ?? undefined };
}

/**
 * Extract audit-log fields for lovable_paddle_events. Called for every
 * event we accept (both processed and skipped) so operators can trace
 * why an event did or didn't produce a row.
 */
export function auditFields(event: EventLike, env: PaddleEnv) {
  const type = event.eventType ?? 'unknown';
  const data = (event.data ?? {}) as SubscriptionData & TransactionData;
  const item = firstItem(data);
  return {
    event_type: type,
    environment: env,
    user_id: data.customData?.userId ?? null,
    paddle_subscription_id: (data as SubscriptionData).id ?? null,
    paddle_transaction_id:
      type.startsWith('transaction.') ? ((data as TransactionData).id ?? null) : null,
    price_external_id: item?.price?.importMeta?.externalId ?? null,
    product_external_id:
      (item as { product?: { importMeta?: { externalId?: string } | null } } | null)
        ?.product?.importMeta?.externalId ?? null,
  };
}

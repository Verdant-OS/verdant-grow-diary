/**
 * Unit tests for the pure Lovable Paddle webhook event processor.
 *
 * Covers Phase 2a webhook safety requirements #3–#11 of the task:
 * user-id mapping, skip-reasons, subscription upserts, founder lifetime
 * transaction handling, unknown price skipping, environment persistence.
 *
 * Signature-verification tests live at the transport layer (index.ts) and
 * are covered by the raw-body clone + verifyWebhook behavior; we do not
 * re-test the Paddle SDK here.
 */
import { describe, expect, it } from 'vitest';
import {
  attachResolvedPriceExternalId,
  auditFields,
  decide,
  transactionPriceIdNeedingLookup,
} from '../../supabase/functions/payments-webhook/eventProcessor';

const NOW = new Date('2026-07-09T12:00:00.000Z');

function subEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_test_1',
    eventType: 'subscription.created',
    data: {
      id: 'sub_abc',
      customerId: 'ctm_abc',
      status: 'active',
      currentBillingPeriod: {
        startsAt: '2026-07-01T00:00:00Z',
        endsAt: '2026-08-01T00:00:00Z',
      },
      customData: { userId: 'user-uuid-1' },
      items: [
        {
          price: { id: 'pri_x', importMeta: { externalId: 'pro_monthly' } },
          product: { id: 'pro_x', importMeta: { externalId: 'verdant_pro' } },
        },
      ],
      ...overrides,
    },
  };
}

function txEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_tx_1',
    eventType: 'transaction.completed',
    data: {
      id: 'txn_abc',
      customerId: 'ctm_abc',
      status: 'completed',
      customData: { userId: 'user-uuid-1' },
      items: [
        {
          price: {
            id: 'pri_lifetime',
            productId: 'pro_lifetime',
            importMeta: { externalId: 'founder_lifetime' },
          },
        },
      ],
      ...overrides,
    },
  };
}

describe('decide: subscription.created', () => {
  it('produces an upsert row with env, period, and external ids', () => {
    const d = decide(subEvent(), 'sandbox', NOW);
    expect(d.kind).toBe('upsert_subscription');
    if (d.kind !== 'upsert_subscription') throw new Error('narrow');
    expect(d.row).toMatchObject({
      user_id: 'user-uuid-1',
      paddle_subscription_id: 'sub_abc',
      price_id: 'pro_monthly',
      product_id: 'verdant_pro',
      status: 'active',
      environment: 'sandbox',
      current_period_end: '2026-08-01T00:00:00Z',
      cancel_at_period_end: false,
    });
  });

  it('persists live environment when env=live', () => {
    const d = decide(subEvent(), 'live', NOW);
    if (d.kind !== 'upsert_subscription') throw new Error('narrow');
    expect(d.row.environment).toBe('live');
  });

  it('skips when customData.userId is missing (never overgrants)', () => {
    const d = decide(subEvent({ customData: null }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'missing_user_id' });
  });

  it('skips when price external id is missing', () => {
    const d = decide(
      subEvent({ items: [{ price: { id: 'pri_x' }, product: { importMeta: { externalId: 'x' } } }] }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'missing_price_external_id' });
  });

  it('skips when price external id is unknown', () => {
    const d = decide(
      subEvent({
        items: [
          {
            price: { importMeta: { externalId: 'mystery_price' } },
            product: { importMeta: { externalId: 'verdant_pro' } },
          },
        ],
      }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'unknown_price_id' });
  });

  it('skips when product external id is missing (never writes raw pro_ id)', () => {
    const d = decide(
      subEvent({
        items: [{ price: { importMeta: { externalId: 'pro_annual' } }, product: { id: 'pro_x' } }],
      }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'missing_product_external_id' });
  });
});

describe('decide: subscription.canceled', () => {
  it('produces a canceled update patch keyed by subscription id', () => {
    const d = decide(
      { eventType: 'subscription.canceled', data: { id: 'sub_abc' } },
      'sandbox',
      NOW,
    );
    expect(d.kind).toBe('update_subscription');
    if (d.kind !== 'update_subscription') throw new Error('narrow');
    expect(d.paddleSubscriptionId).toBe('sub_abc');
    expect(d.patch.status).toBe('canceled');
    expect(d.patch.cancel_at_period_end).toBe(true);
    expect(d.patch.environment).toBe('sandbox');
  });
});

describe('decide: transaction.completed → founder_lifetime', () => {
  it('records a lifetime row with null current_period_end (no expiry)', () => {
    const d = decide(txEvent(), 'sandbox', NOW);
    expect(d.kind).toBe('record_lifetime');
    if (d.kind !== 'record_lifetime') throw new Error('narrow');
    expect(d.row.price_id).toBe('founder_lifetime');
    expect(d.row.product_id).toBe('founder_lifetime');
    expect(d.row.current_period_end).toBeNull();
    expect(d.row.status).toBe('active');
    expect(d.row.paddle_subscription_id).toBe('lifetime_txn_abc');
    expect(d.row.environment).toBe('sandbox');
  });

  it('skips recurring transactions (subscriptionId set) as non_lifetime', () => {
    const d = decide(
      txEvent({ subscriptionId: 'sub_abc' }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'non_lifetime_transaction' });
  });

  it('skips pro_monthly/pro_annual transactions as unknown_lifetime_price_id (double-write guard)', () => {
    // Recurring plans arrive with subscriptionId → covered above.
    // The remaining pro_* transaction shape (no subscriptionId) is a
    // config bug; we still refuse to double-write.
    const d = decide(
      txEvent({
        items: [{ price: { id: 'pri_x', importMeta: { externalId: 'pro_monthly' } } }],
      }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'unknown_lifetime_price_id' });
  });

  it('skips a lifetime transaction with no userId (never overgrants)', () => {
    const d = decide(txEvent({ customData: null }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'missing_user_id' });
  });

  it('skips a transaction in a non-completed status', () => {
    const d = decide(txEvent({ status: 'past_due' }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'non_lifetime_transaction' });
  });

  it('skips when price external id is missing entirely (unresolvable)', () => {
    const d = decide(
      txEvent({ items: [{ price: { id: 'pri_unknown' } }] }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'unknown_lifetime_price_id' });
  });

  it('skips lifetime transaction with no transaction id', () => {
    const d = decide(txEvent({ id: undefined }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'missing_transaction_id' });
  });

  it('persists live environment when env=live', () => {
    const d = decide(txEvent(), 'live', NOW);
    if (d.kind !== 'record_lifetime') throw new Error('narrow');
    expect(d.row.environment).toBe('live');
    expect(d.row.paddle_subscription_id).toBe('lifetime_txn_abc');
  });
});

describe('decide: unhandled types', () => {
  it('skips subscription.trialing / transaction.payment_failed / random types', () => {
    for (const t of ['transaction.payment_failed', 'random.thing', undefined]) {
      const d = decide({ eventType: t as string | undefined, data: {} }, 'sandbox', NOW);
      expect(d).toEqual({ kind: 'skip', reason: 'unhandled_event_type' });
    }
  });
});

describe('auditFields', () => {
  it('extracts audit metadata for subscription events', () => {
    const a = auditFields(subEvent(), 'sandbox');
    expect(a).toMatchObject({
      event_type: 'subscription.created',
      environment: 'sandbox',
      user_id: 'user-uuid-1',
      paddle_subscription_id: 'sub_abc',
      price_external_id: 'pro_monthly',
      product_external_id: 'verdant_pro',
      paddle_transaction_id: null,
    });
  });

  it('sets paddle_transaction_id only for transaction.* events', () => {
    const a = auditFields(txEvent(), 'sandbox');
    expect(a.paddle_transaction_id).toBe('txn_abc');
    expect(a.paddle_subscription_id).toBe('txn_abc'); // TransactionData.id
  });
});

describe('transactionPriceIdNeedingLookup', () => {
  it('returns null for subscription events', () => {
    expect(transactionPriceIdNeedingLookup(subEvent())).toBeNull();
  });

  it('returns null when importMeta.externalId is already resolved', () => {
    expect(transactionPriceIdNeedingLookup(txEvent())).toBeNull();
  });

  it('returns null when the transaction has a subscriptionId (recurring)', () => {
    expect(
      transactionPriceIdNeedingLookup(txEvent({ subscriptionId: 'sub_x' })),
    ).toBeNull();
  });

  it('returns the paddle price id when external id is missing and no subscriptionId', () => {
    const ev = txEvent({ items: [{ price: { id: 'pri_needs_lookup' } }] });
    expect(transactionPriceIdNeedingLookup(ev)).toBe('pri_needs_lookup');
  });

  it('returns null when there is no price id at all', () => {
    const ev = txEvent({ items: [{ price: {} }] });
    expect(transactionPriceIdNeedingLookup(ev)).toBeNull();
  });
});

describe('attachResolvedPriceExternalId', () => {
  it('fills in a resolved external id on the first item', () => {
    const ev = txEvent({ items: [{ price: { id: 'pri_x' } }] });
    attachResolvedPriceExternalId(ev, 'founder_lifetime');
    // After attach, decide() should now record lifetime.
    const d = decide(ev, 'sandbox', NOW);
    expect(d.kind).toBe('record_lifetime');
  });

  it('is a no-op when the external id is null (unknown)', () => {
    const ev = txEvent({ items: [{ price: { id: 'pri_x' } }] });
    attachResolvedPriceExternalId(ev, null);
    const d = decide(ev, 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'unknown_lifetime_price_id' });
  });
});

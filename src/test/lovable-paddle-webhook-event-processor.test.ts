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
  auditFields,
  decide,
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
    expect(d.row.current_period_end).toBeNull();
    expect(d.row.status).toBe('active');
    expect(d.row.paddle_subscription_id).toBe('lifetime_txn_abc');
  });

  it('skips non-lifetime transactions (they come via subscription events)', () => {
    const d = decide(
      txEvent({
        items: [{ price: { importMeta: { externalId: 'pro_monthly' } } }],
      }),
      'sandbox',
      NOW,
    );
    expect(d).toEqual({ kind: 'skip', reason: 'non_lifetime_transaction' });
  });

  it('skips a lifetime transaction with no userId (never overgrants)', () => {
    const d = decide(txEvent({ customData: null }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'missing_user_id' });
  });

  it('skips a transaction in a non-completed status', () => {
    const d = decide(txEvent({ status: 'past_due' }), 'sandbox', NOW);
    expect(d).toEqual({ kind: 'skip', reason: 'non_lifetime_transaction' });
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

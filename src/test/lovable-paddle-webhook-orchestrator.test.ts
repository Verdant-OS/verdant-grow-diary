/**
 * Reliability tests for the Lovable Paddle webhook orchestrator.
 *
 * Covers the failure/duplicate contract required before manual preview
 * checkout is approved:
 *   - DB failure inserting the event log → 500
 *   - DB failure writing the subscription → 500 + failed audit row
 *   - Duplicate already 'processed' → 200 no-op (no double write)
 *   - Duplicate previously 'failed' → reprocess (not a no-op)
 *   - Duplicate previously 'skipped' → 200 no-op
 *   - Successful subscription event → 200
 *   - Successful founder_lifetime transaction → 200
 *
 * Purely in-memory: no Supabase, no Paddle SDK. Signature-verification
 * failure is transport-level and covered separately by the existing
 * static tests / index.ts inspection.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleVerifiedEvent,
  redactError,
  type Deps,
  type ExistingEventRow,
} from '../../supabase/functions/payments-webhook/orchestrator';

const NOW = new Date('2026-07-09T12:00:00.000Z');

function subEvent(overrides: Record<string, unknown> = {}, eventId = 'evt_sub_1') {
  return {
    eventId,
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

function txEvent(eventId = 'evt_tx_1') {
  return {
    eventId,
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
    },
  };
}

interface Fixture {
  deps: Deps;
  existingByEventId: Map<string, ExistingEventRow>;
  markCalls: Array<{ id: string; patch: Parameters<Deps['markEvent']>[1] }>;
  upsertCalls: Array<Parameters<Deps['upsertSubscription']>[0]>;
  updateCalls: Array<{ id: string; patch: Parameters<Deps['updateSubscription']>[1] }>;
  insertCalls: Array<Parameters<Deps['insertEventReceived']>[0]>;
}

function makeFixture(overrides: Partial<{
  insertResult: Awaited<ReturnType<Deps['insertEventReceived']>>;
  lookupResult: Awaited<ReturnType<Deps['getExistingEvent']>>;
  upsertResult: Awaited<ReturnType<Deps['upsertSubscription']>>;
  updateResult: Awaited<ReturnType<Deps['updateSubscription']>>;
  markResult: Awaited<ReturnType<Deps['markEvent']>>;
  seedExisting?: Array<[string, ExistingEventRow]>;
}> = {}): Fixture {
  const existingByEventId = new Map<string, ExistingEventRow>(overrides.seedExisting ?? []);
  const insertCalls: Fixture['insertCalls'] = [];
  const markCalls: Fixture['markCalls'] = [];
  const upsertCalls: Fixture['upsertCalls'] = [];
  const updateCalls: Fixture['updateCalls'] = [];

  const deps: Deps = {
    insertEventReceived: vi.fn(async (input): ReturnType<Deps['insertEventReceived']> => {
      insertCalls.push(input);
      if (overrides.insertResult) return overrides.insertResult;
      if (existingByEventId.has(input.paddle_event_id)) return { ok: true, duplicate: true };
      existingByEventId.set(input.paddle_event_id, { processing_status: 'received' });
      return { ok: true };
    }),
    getExistingEvent: vi.fn(async (id): ReturnType<Deps['getExistingEvent']> => {
      if (overrides.lookupResult) return overrides.lookupResult;
      return { ok: true, row: existingByEventId.get(id) ?? null };
    }),
    upsertSubscription: vi.fn(async (row): ReturnType<Deps['upsertSubscription']> => {
      upsertCalls.push(row);
      return overrides.upsertResult ?? { ok: true };
    }),
    updateSubscription: vi.fn(async (id, patch): ReturnType<Deps['updateSubscription']> => {
      updateCalls.push({ id, patch });
      return overrides.updateResult ?? { ok: true };
    }),
    markEvent: vi.fn(async (id, patch): ReturnType<Deps['markEvent']> => {
      markCalls.push({ id, patch });
      if (overrides.markResult) return overrides.markResult;
      existingByEventId.set(id, { processing_status: patch.processing_status });
      return { ok: true };
    }),
  };


  return { deps, existingByEventId, markCalls, upsertCalls, updateCalls, insertCalls };
}

describe('handleVerifiedEvent — success paths', () => {
  it('subscription.created: durably records, upserts, marks processed, 200', async () => {
    const f = makeFixture();
    const res = await handleVerifiedEvent(f.deps, subEvent(), 'sandbox', NOW, { raw: true });
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('processed:upsert_subscription');
    expect(f.insertCalls).toHaveLength(1);
    expect(f.upsertCalls).toHaveLength(1);
    expect(f.upsertCalls[0].user_id).toBe('user-uuid-1');
    expect(f.markCalls.at(-1)?.patch.processing_status).toBe('processed');
  });

  it('founder_lifetime transaction: records lifetime row and marks processed, 200', async () => {
    const f = makeFixture();
    const res = await handleVerifiedEvent(f.deps, txEvent(), 'sandbox', NOW, { raw: true });
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('processed:record_lifetime');
    expect(f.upsertCalls[0].price_id).toBe('founder_lifetime');
    expect(f.markCalls.at(-1)?.patch.processing_status).toBe('processed');
  });

  it('skip reason is durably marked skipped and returns 200', async () => {
    const f = makeFixture();
    const noUser = subEvent({ customData: null }, 'evt_skip_1');
    const res = await handleVerifiedEvent(f.deps, noUser, 'sandbox', NOW, {});
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('skipped:missing_user_id');
    expect(f.upsertCalls).toHaveLength(0);
    expect(f.markCalls.at(-1)?.patch.processing_status).toBe('skipped');
    expect(f.markCalls.at(-1)?.patch.skip_reason).toBe('missing_user_id');
  });
});

describe('handleVerifiedEvent — failure paths return 500 so Paddle retries', () => {
  it('DB failure on event-log insert returns 500 and does NOT write subscription', async () => {
    const f = makeFixture({
      insertResult: { ok: false, error: 'connection refused' },
    });
    const res = await handleVerifiedEvent(f.deps, subEvent(), 'sandbox', NOW, {});
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/^event_log_insert_failed:/);
    expect(f.upsertCalls).toHaveLength(0);
    expect(f.markCalls).toHaveLength(0);
  });

  it('DB failure on subscription upsert returns 500 and marks event failed', async () => {
    const f = makeFixture({
      upsertResult: { ok: false, error: 'deadlock detected' },
    });
    const res = await handleVerifiedEvent(f.deps, subEvent(), 'sandbox', NOW, {});
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/^write_failed:/);
    const lastMark = f.markCalls.at(-1);
    expect(lastMark?.patch.processing_status).toBe('failed');
    expect(lastMark?.patch.last_error).toContain('deadlock');
  });

  it('DB failure on mark-processed returns 500 (Paddle retry will reapply idempotently)', async () => {
    const f = makeFixture({ markResult: { ok: false, error: 'network blip' } });
    const res = await handleVerifiedEvent(f.deps, subEvent(), 'sandbox', NOW, {});
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/^mark_processed_failed:/);
    expect(f.upsertCalls).toHaveLength(1);
  });
});

describe('handleVerifiedEvent — duplicate delivery semantics', () => {
  it('duplicate already processed: no-op 200, no re-upsert', async () => {
    const f = makeFixture({
      seedExisting: [['evt_dup_1', { processing_status: 'processed' }]],
    });
    const res = await handleVerifiedEvent(
      f.deps,
      subEvent({}, 'evt_dup_1'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('duplicate_processed');
    expect(f.upsertCalls).toHaveLength(0);
    // Only the initial received-insert was called; no mark update after.
    expect(f.markCalls).toHaveLength(0);
  });

  it('duplicate previously skipped: no-op 200', async () => {
    const f = makeFixture({
      seedExisting: [['evt_dup_2', { processing_status: 'skipped' }]],
    });
    const res = await handleVerifiedEvent(
      f.deps,
      subEvent({}, 'evt_dup_2'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('duplicate_skipped');
    expect(f.upsertCalls).toHaveLength(0);
  });

  it('duplicate previously failed: REPROCESSES instead of no-op', async () => {
    const f = makeFixture({
      seedExisting: [['evt_retry_1', { processing_status: 'failed' }]],
    });
    const res = await handleVerifiedEvent(
      f.deps,
      subEvent({}, 'evt_retry_1'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('processed:upsert_subscription');
    expect(f.upsertCalls).toHaveLength(1);
    expect(f.markCalls.at(-1)?.patch.processing_status).toBe('processed');
  });

  it('duplicate previously in received (crashed mid-processing): reprocesses', async () => {
    const f = makeFixture({
      seedExisting: [['evt_stuck_1', { processing_status: 'received' }]],
    });
    const res = await handleVerifiedEvent(
      f.deps,
      subEvent({}, 'evt_stuck_1'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('processed:upsert_subscription');
    expect(f.upsertCalls).toHaveLength(1);
  });

  it('DB failure on duplicate lookup returns 500', async () => {
    const f = makeFixture({
      seedExisting: [['evt_dup_lookup', { processing_status: 'processed' }]],
      lookupResult: { ok: false, error: 'timeout' },
    });
    const res = await handleVerifiedEvent(
      f.deps,
      subEvent({}, 'evt_dup_lookup'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/^event_log_lookup_failed:/);
  });
});

describe('redactError', () => {
  it('redacts secret-shaped substrings and caps length', () => {
    const out = redactError('failed with service_role=eyJhbGciOi and api_key=abc');
    expect(out).not.toContain('eyJhbGciOi');
    expect(out).not.toContain('abc');
    expect(out).toContain('[redacted]');
  });

  it('truncates to 500 chars', () => {
    expect(redactError('x'.repeat(2000)).length).toBe(500);
  });
});

/**
 * Founder Lifetime resolver integration:
 * transaction.completed events frequently omit importMeta.externalId, so
 * the orchestrator must call resolvePriceExternalIdByPaddleId(env, priceId)
 * before decide() to identify founder_lifetime by paddle price id.
 */
function txEventNoExternalId(priceId = 'pri_lifetime_sandbox', eventId = 'evt_tx_lookup_1') {
  return {
    eventId,
    eventType: 'transaction.completed',
    data: {
      id: 'txn_lookup_1',
      customerId: 'ctm_abc',
      status: 'completed',
      customData: { userId: 'user-uuid-2' },
      items: [{ price: { id: priceId, productId: 'pro_lifetime' } }],
    },
  };
}

describe('handleVerifiedEvent — founder_lifetime price resolution', () => {
  it('resolves paddle price id → founder_lifetime and records lifetime row', async () => {
    const f = makeFixture();
    const resolver = vi.fn(async () => ({ ok: true as const, externalId: 'founder_lifetime' }));
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = resolver;

    const res = await handleVerifiedEvent(
      f.deps,
      txEventNoExternalId('pri_lifetime_sandbox'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('processed:record_lifetime');
    expect(resolver).toHaveBeenCalledWith('sandbox', 'pri_lifetime_sandbox');
    expect(f.upsertCalls).toHaveLength(1);
    expect(f.upsertCalls[0].price_id).toBe('founder_lifetime');
    expect(f.upsertCalls[0].paddle_subscription_id).toBe('lifetime_txn_lookup_1');
    expect(f.upsertCalls[0].current_period_end).toBeNull();
  });

  it('skips as unknown_lifetime_price_id when resolver returns null (unknown price)', async () => {
    const f = makeFixture();
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = vi.fn(
      async () => ({ ok: true as const, externalId: null }),
    );
    const res = await handleVerifiedEvent(
      f.deps,
      txEventNoExternalId('pri_unknown'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(200);
    expect(res.reason).toBe('skipped:unknown_lifetime_price_id');
    expect(f.upsertCalls).toHaveLength(0);
  });

  it('skips as unknown_lifetime_price_id when resolver returns pro_monthly (double-write guard)', async () => {
    const f = makeFixture();
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = vi.fn(
      async () => ({ ok: true as const, externalId: 'pro_monthly' }),
    );
    const res = await handleVerifiedEvent(
      f.deps,
      txEventNoExternalId('pri_pro_m'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.reason).toBe('skipped:unknown_lifetime_price_id');
    expect(f.upsertCalls).toHaveLength(0);
  });

  it('returns 500 when resolver fails (transient) so Paddle retries', async () => {
    const f = makeFixture();
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = vi.fn(
      async () => ({ ok: false as const, error: 'network timeout' }),
    );
    const res = await handleVerifiedEvent(
      f.deps,
      txEventNoExternalId('pri_x'),
      'sandbox',
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/^price_lookup_failed:/);
    expect(f.upsertCalls).toHaveLength(0);
  });

  it('does NOT call the resolver for recurring transactions (subscriptionId set)', async () => {
    const f = makeFixture();
    const resolver = vi.fn(async () => ({ ok: true as const, externalId: 'founder_lifetime' }));
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = resolver;

    const ev = txEventNoExternalId('pri_x', 'evt_recurring_1');
    (ev.data as { subscriptionId?: string }).subscriptionId = 'sub_abc';

    const res = await handleVerifiedEvent(f.deps, ev, 'sandbox', NOW, {});
    expect(resolver).not.toHaveBeenCalled();
    expect(res.reason).toBe('skipped:non_lifetime_transaction');
  });

  it('idempotent duplicate: second delivery of the same lifetime tx is a no-op', async () => {
    const f = makeFixture();
    (f.deps as Deps).resolvePriceExternalIdByPaddleId = vi.fn(
      async () => ({ ok: true as const, externalId: 'founder_lifetime' }),
    );
    const ev = txEventNoExternalId('pri_lifetime_sandbox', 'evt_dup_lifetime');

    const first = await handleVerifiedEvent(f.deps, ev, 'sandbox', NOW, {});
    expect(first.reason).toBe('processed:record_lifetime');

    const second = await handleVerifiedEvent(
      f.deps,
      txEventNoExternalId('pri_lifetime_sandbox', 'evt_dup_lifetime'),
      'sandbox',
      NOW,
      {},
    );
    expect(second.reason).toBe('duplicate_processed');
    // Only one upsert total.
    expect(f.upsertCalls).toHaveLength(1);
  });
});

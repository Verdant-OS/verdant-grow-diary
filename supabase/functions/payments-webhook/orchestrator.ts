/**
 * Pure webhook orchestrator for the Lovable built-in Paddle sink.
 *
 * Owns the "durably record → decide → write → mark" lifecycle so we can
 * unit-test the reliability contract without touching Supabase or Paddle:
 *
 *   1. Verified event is always durably recorded first (status='received').
 *      If that insert fails with anything other than a duplicate, return 500
 *      so Paddle retries — otherwise we would silently drop the event.
 *   2. On duplicate paddle_event_id, look up the prior processing_status:
 *        - processed / skipped  → no-op 200 (idempotent)
 *        - received / failed    → fall through and (re)process
 *   3. Decide via the pure `decide()` helper.
 *   4. Perform the DB write. If it fails, mark the event 'failed' with a
 *      redacted last_error and return 500 (Paddle retries; duplicate branch
 *      above will reprocess on next delivery).
 *   5. On success, mark 'processed'. If the mark itself fails, return 500
 *      so Paddle retries — subscription upsert is idempotent so replay is
 *      safe.
 *
 * index.ts is a thin transport wrapper around this function.
 */
import {
  attachResolvedPriceExternalId,
  auditFields,
  decide,
  transactionPriceIdNeedingLookup,
  type Decision,
  type PaddleEnv,
} from './eventProcessor.ts';

export type ProcessingStatus = 'received' | 'processed' | 'skipped' | 'failed';

export type IoResult = { ok: true } | { ok: false; error: string };
export type InsertResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string };

/**
 * Result of allocate_lovable_founder_lifetime. `ok=true, reason='allocated'`
 * inserted a new lifetime row; `ok=true, reason='idempotent'` matched an
 * existing row for the same paddle transaction id; `ok=false,
 * reason='cap_reached'` refused because 75 active founder rows already
 * exist. Any other `ok=false` is an unexpected shape and is surfaced as
 * a transient failure so Paddle retries.
 */
export type FounderAllocationResult =
  | { ok: true; reason: 'allocated' | 'idempotent' }
  | { ok: false; reason: 'cap_reached' | 'invalid_input' | string };

export interface ExistingEventRow {
  processing_status: ProcessingStatus;
}

export interface EventLikeWithId {
  eventId?: string;
  eventType?: string;
  data?: unknown;
}

export interface MarkPatch {
  processing_status: ProcessingStatus;
  processed_ok: boolean;
  skip_reason: string | null;
  last_error: string | null;
}

type UpsertRow = Extract<
  Decision,
  { kind: 'upsert_subscription' | 'record_lifetime' }
>['row'];
type UpdatePatch = Extract<Decision, { kind: 'update_subscription' }>['patch'];

export interface Deps {
  insertEventReceived(input: {
    paddle_event_id: string;
    audit: ReturnType<typeof auditFields>;
    payload: unknown;
  }): Promise<InsertResult>;
  getExistingEvent(
    paddle_event_id: string,
  ): Promise<{ ok: true; row: ExistingEventRow | null } | { ok: false; error: string }>;
  upsertSubscription(row: UpsertRow): Promise<IoResult>;
  updateSubscription(
    paddle_subscription_id: string,
    patch: UpdatePatch,
    env: PaddleEnv,
  ): Promise<IoResult>;
  markEvent(paddle_event_id: string, patch: MarkPatch): Promise<IoResult>;
  /**
   * Reverse-lookup a Paddle internal price id (`pri_...`) into the
   * human-readable `importMeta.externalId` (e.g. `"founder_lifetime"`).
   * Called for one-time `transaction.completed` events where the event
   * payload does not carry importMeta. Returns `externalId: null` if the
   * price exists but has no import_meta.external_id — the orchestrator
   * treats that as "unknown price" and the event is skipped.
   *
   * Optional so unit-test fixtures for subscription paths don't need to
   * provide it. The runtime wires this in index.ts.
   */
  resolvePriceExternalIdByPaddleId?(
    env: PaddleEnv,
    paddlePriceId: string,
  ): Promise<{ ok: true; externalId: string | null } | { ok: false; error: string }>;
  /**
   * H3 (audit fix): atomic Founder Lifetime allocator. Called for
   * `transaction.completed` + `price_external_id='founder_lifetime'`
   * events INSTEAD of the raw upsert path. Wraps the DB RPC
   * `allocate_lovable_founder_lifetime` which enforces the 75-slot cap
   * under a transactional advisory lock. Optional so pure unit tests for
   * subscription paths don't need to provide it.
   */
  allocateFounderLifetime?(input: {
    user_id: string;
    paddle_transaction_id: string;
    paddle_customer_id: string;
    environment: PaddleEnv;
    now: Date;
  }): Promise<FounderAllocationResult>;
}


export interface HandleResult {
  httpStatus: 200 | 500;
  reason: string;
}

/**
 * Redact obvious secret-shaped substrings before we persist an error into
 * lovable_paddle_events.last_error. We never expect real secrets to leak
 * here (the DB client errors are just Postgres messages), but the audit
 * column is service-role readable and we want defense in depth.
 */
export function redactError(e: string): string {
  return e
    .replace(/(?:api[_-]?key|service[_-]?role|secret|token|password|bearer)[^\s]*/gi, '[redacted]')
    .slice(0, 500);
}

function resolvePaddleEventId(event: EventLikeWithId, env: PaddleEnv, now: Date): string {
  if (typeof event.eventId === 'string' && event.eventId.length > 0) return event.eventId;
  // Synthetic id lets us still record the event durably; deterministic on
  // (env, type, timestamp) so a same-instant retry stays idempotent.
  return `synthetic_${env}_${event.eventType ?? 'unknown'}_${now.toISOString()}`;
}

export async function handleVerifiedEvent(
  deps: Deps,
  event: EventLikeWithId,
  env: PaddleEnv,
  now: Date,
  rawPayload: unknown,
): Promise<HandleResult> {
  const paddleEventId = resolvePaddleEventId(event, env, now);
  const audit = auditFields(event, env);

  // 1) Durably record 'received' before doing any subscription write.
  const insertRes = await deps.insertEventReceived({
    paddle_event_id: paddleEventId,
    audit,
    payload: rawPayload,
  });

  if ('error' in insertRes) {
    // Cannot even record the event — refuse to acknowledge so Paddle retries.
    return { httpStatus: 500, reason: `event_log_insert_failed:${redactError(insertRes.error)}` };
  }

  if (insertRes.duplicate) {
    const existing = await deps.getExistingEvent(paddleEventId);
    if ('error' in existing) {
      return { httpStatus: 500, reason: `event_log_lookup_failed:${redactError(existing.error)}` };
    }
    const prior = existing.row?.processing_status;
    if (prior === 'processed' || prior === 'skipped') {
      return { httpStatus: 200, reason: `duplicate_${prior}` };
    }
    // prior is 'received' or 'failed' (or row somehow missing) → reprocess.
  }

  // 2) Resolve transaction price external id if needed.
  // transaction.completed payloads may omit importMeta.externalId. If we
  // have a Paddle internal price id, look it up so decide() can identify
  // founder_lifetime vs recurring. A resolver error is transient → 500.
  const priceIdToResolve = transactionPriceIdNeedingLookup(event);
  if (priceIdToResolve && deps.resolvePriceExternalIdByPaddleId) {
    const resolved = await deps.resolvePriceExternalIdByPaddleId(env, priceIdToResolve);
    if ('error' in resolved) {
      return {
        httpStatus: 500,
        reason: `price_lookup_failed:${redactError(resolved.error)}`,
      };
    }
    attachResolvedPriceExternalId(event, resolved.externalId);
  }

  // 3) Decide.
  const decision = decide(event, env, now);

  if (decision.kind === 'skip') {
    const mark = await deps.markEvent(paddleEventId, {
      processing_status: 'skipped',
      processed_ok: false,
      skip_reason: decision.reason,
      last_error: null,
    });
    if ('error' in mark) {
      return { httpStatus: 500, reason: `mark_skipped_failed:${redactError(mark.error)}` };
    }
    return { httpStatus: 200, reason: `skipped:${decision.reason}` };
  }

  // 3) Write.
  let writeRes: IoResult;
  if (decision.kind === 'record_lifetime') {
    // H3 (audit fix): the raw upsert path used to write the founder row
    // directly, bypassing the 75-slot cap. Route through the atomic
    // service-role RPC instead. If the allocator dep is not wired (pure
    // unit tests for subscription paths), fall back to the plain upsert
    // — those tests never exercise the founder path.
    if (deps.allocateFounderLifetime) {
      const row = decision.row;
      // The pseudo-subscription id is `lifetime_<paddle_transaction_id>`
      // (see eventProcessor.decide). Recover the transaction id so the
      // RPC can rebuild it identically for idempotency.
      const txId = row.paddle_subscription_id.startsWith('lifetime_')
        ? row.paddle_subscription_id.slice('lifetime_'.length)
        : row.paddle_subscription_id;
      const alloc = await deps.allocateFounderLifetime({
        user_id: row.user_id,
        paddle_transaction_id: txId,
        paddle_customer_id: row.paddle_customer_id,
        environment: env,
        now,
      });
      if (!alloc.ok) {
        if (alloc.reason === 'cap_reached') {
          // Cap enforcement is not a webhook failure — the buyer's payment
          // needs an operator refund per the runbook, but Paddle should
          // stop retrying. Mark as skipped and 200.
          const mark = await deps.markEvent(paddleEventId, {
            processing_status: 'skipped',
            processed_ok: false,
            skip_reason: 'founder_cap_reached',
            last_error: null,
          });
          if ('error' in mark) {
            return {
              httpStatus: 500,
              reason: `mark_skipped_failed:${redactError(mark.error)}`,
            };
          }
          return { httpStatus: 200, reason: 'skipped:founder_cap_reached' };
        }
        // Any other allocator failure is transient — surface as 500 so
        // Paddle retries (allocator is idempotent by paddle_subscription_id).
        const err = `founder_allocator_failed:${alloc.reason}`;
        await deps.markEvent(paddleEventId, {
          processing_status: 'failed',
          processed_ok: false,
          skip_reason: null,
          last_error: redactError(err),
        });
        return { httpStatus: 500, reason: `write_failed:${redactError(err)}` };
      }
      writeRes = { ok: true };
    } else {
      writeRes = await deps.upsertSubscription(decision.row);
    }
  } else if (decision.kind === 'upsert_subscription') {
    writeRes = await deps.upsertSubscription(decision.row);
  } else {
    writeRes = await deps.updateSubscription(decision.paddleSubscriptionId, decision.patch, env);
  }

  if ('error' in writeRes) {
    const err = writeRes.error;
    // Best-effort mark 'failed'; the 500 is what guarantees Paddle retry.
    await deps.markEvent(paddleEventId, {
      processing_status: 'failed',
      processed_ok: false,
      skip_reason: null,
      last_error: redactError(err),
    });
    return { httpStatus: 500, reason: `write_failed:${redactError(err)}` };
  }


  // 4) Mark processed.
  const mark = await deps.markEvent(paddleEventId, {
    processing_status: 'processed',
    processed_ok: true,
    skip_reason: null,
    last_error: null,
  });
  if ('error' in mark) {
    // Subscription upsert is idempotent (unique paddle_subscription_id), so
    // a Paddle retry re-applies the same row and re-attempts this mark.
    return { httpStatus: 500, reason: `mark_processed_failed:${redactError(mark.error)}` };
  }

  return { httpStatus: 200, reason: `processed:${decision.kind}` };
}


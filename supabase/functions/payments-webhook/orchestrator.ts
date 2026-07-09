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

  // 2) Decide.
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
  if (decision.kind === 'upsert_subscription' || decision.kind === 'record_lifetime') {
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


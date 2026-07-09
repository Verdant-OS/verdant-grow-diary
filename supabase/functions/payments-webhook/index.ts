/**
 * Lovable built-in Paddle webhook sink (Phase 2a).
 *
 * Writes to `public.subscriptions` and appends to
 * `public.lovable_paddle_events` for idempotency + audit.
 *
 * Does NOT change entitlements. Phase 2b bridges the resolver.
 * Does NOT touch `billing_subscriptions`, `paddle_events`, or the BYO
 * `paddle-webhook/` function — those remain the BYO source of truth.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, type PaddleEnv } from '../_shared/paddle.ts';
import { auditFields, decide } from './eventProcessor.ts';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }
  return _supabase;
}

function looksLikeEventId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

async function logEvent(
  event: { eventId?: string; occurredAt?: string; eventType?: string; data?: unknown },
  env: PaddleEnv,
  processedOk: boolean,
  skipReason: string | null,
  rawPayload: string,
) {
  const eventId = looksLikeEventId(event.eventId)
    ? event.eventId
    : `synthetic_${crypto.randomUUID()}`;
  const audit = auditFields(
    event as Parameters<typeof auditFields>[0],
    env,
  );
  // Idempotent insert keyed by paddle_event_id (unique). Duplicate deliveries
  // return a conflict, which is exactly the idempotency guarantee we want.
  try {
    await getSupabase().from('lovable_paddle_events').insert({
      paddle_event_id: eventId,
      event_type: audit.event_type,
      environment: audit.environment,
      user_id: audit.user_id,
      paddle_subscription_id: audit.paddle_subscription_id,
      paddle_transaction_id: audit.paddle_transaction_id,
      price_external_id: audit.price_external_id,
      product_external_id: audit.product_external_id,
      processed_ok: processedOk,
      skip_reason: skipReason,
      payload: safeParseJson(rawPayload),
    });
  } catch (e) {
    // Duplicate = already processed. Any other error is logged but does not
    // fail the 200 back to Paddle (Paddle would just retry).
    console.log('lovable_paddle_events insert non-fatal error:', String(e));
  }
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return { _raw: s.slice(0, 4000) }; }
}

async function processEvent(
  event: unknown,
  env: PaddleEnv,
  rawPayload: string,
) {
  const decision = decide(event as Parameters<typeof decide>[0], env, new Date());

  const evId = (event as { eventId?: string }).eventId;

  if (decision.kind === 'skip') {
    console.log('lovable-paddle skip:', decision.reason, 'event:', (event as { eventType?: string }).eventType);
    await logEvent(event as Parameters<typeof logEvent>[0], env, false, decision.reason, rawPayload);
    return;
  }

  if (decision.kind === 'upsert_subscription' || decision.kind === 'record_lifetime') {
    // Idempotent on paddle_subscription_id (unique index).
    const { error } = await getSupabase()
      .from('subscriptions')
      .upsert(decision.row, { onConflict: 'paddle_subscription_id' });
    if (error) {
      console.error('subscriptions upsert error:', error.message);
      await logEvent(event as Parameters<typeof logEvent>[0], env, false, `db_error:${error.message}`, rawPayload);
      return;
    }
    await logEvent(event as Parameters<typeof logEvent>[0], env, true, null, rawPayload);
    return;
  }

  if (decision.kind === 'update_subscription') {
    const { error } = await getSupabase()
      .from('subscriptions')
      .update(decision.patch)
      .eq('paddle_subscription_id', decision.paddleSubscriptionId)
      .eq('environment', env);
    if (error) {
      console.error('subscriptions update error:', error.message);
      await logEvent(event as Parameters<typeof logEvent>[0], env, false, `db_error:${error.message}`, rawPayload);
      return;
    }
    await logEvent(event as Parameters<typeof logEvent>[0], env, true, null, rawPayload);
    return;
  }

  // Exhaustive; TS narrows to never.
  const _: never = decision;
  return _;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;
  if (env !== 'sandbox' && env !== 'live') {
    return new Response('Invalid env', { status: 400 });
  }

  // We need the raw body twice: once for Paddle signature verification
  // (via verifyWebhook) and once to persist as-is into the audit log.
  // verifyWebhook consumes req.text(), so we clone first.
  const cloned = req.clone();
  const rawBody = await cloned.text();

  let event: unknown;
  try {
    event = await verifyWebhook(req, env);
  } catch (e) {
    console.error('paddle signature verification failed:', String(e));
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    await processEvent(event, env, rawBody);
  } catch (e) {
    // Log but still 200 — Paddle will retry a 5xx forever and we don't want
    // duplicate deliveries when the failure was transient. Idempotency
    // protects us on retry.
    console.error('processEvent error:', String(e));
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

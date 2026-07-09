/**
 * Lovable built-in Paddle webhook sink (Phase 2a + reliability patch).
 *
 * Thin transport wrapper around the pure `handleVerifiedEvent`
 * orchestrator. All lifecycle / duplicate / failure semantics live in
 * orchestrator.ts and are unit-tested there.
 *
 * Response contract (see orchestrator.ts for the full state machine):
 *   - non-POST                        → 405
 *   - bad env query param             → 400
 *   - invalid Paddle signature        → 400
 *   - event durably recorded + write  → 200
 *   - duplicate already processed     → 200 (no-op)
 *   - duplicate previously failed     → reprocess, 200/500 per result
 *   - any DB failure before durable
 *     success                         → 500 so Paddle retries
 *
 * Does NOT touch entitlements, gates, or the BYO paddle-webhook stack.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, getPaddleClient, type PaddleEnv } from '../_shared/paddle.ts';
import { handleVerifiedEvent, type Deps, type EventLikeWithId } from './orchestrator.ts';

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

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s.slice(0, 4000) };
  }
}

function buildDeps(): Deps {
  const sb = getSupabase();
  return {
    async insertEventReceived({ paddle_event_id, audit, payload }) {
      const { error } = await sb.from('lovable_paddle_events').insert({
        paddle_event_id,
        event_type: audit.event_type,
        environment: audit.environment,
        user_id: audit.user_id,
        paddle_subscription_id: audit.paddle_subscription_id,
        paddle_transaction_id: audit.paddle_transaction_id,
        price_external_id: audit.price_external_id,
        product_external_id: audit.product_external_id,
        processing_status: 'received',
        processed_ok: false,
        skip_reason: null,
        last_error: null,
        payload,
      });
      if (!error) return { ok: true };
      // 23505 = unique_violation on paddle_event_id → duplicate delivery.
      if ((error as { code?: string }).code === '23505') {
        return { ok: true, duplicate: true };
      }
      return { ok: false, error: error.message };
    },
    async getExistingEvent(paddle_event_id) {
      const { data, error } = await sb
        .from('lovable_paddle_events')
        .select('processing_status')
        .eq('paddle_event_id', paddle_event_id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        row: (data ?? null) as { processing_status: 'received' | 'processed' | 'skipped' | 'failed' } | null,
      };
    },
    async upsertSubscription(row) {
      const { error } = await sb
        .from('subscriptions')
        .upsert(row, { onConflict: 'paddle_subscription_id' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async updateSubscription(paddle_subscription_id, patch, env) {
      const { error } = await sb
        .from('subscriptions')
        .update(patch)
        .eq('paddle_subscription_id', paddle_subscription_id)
        .eq('environment', env);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async markEvent(paddle_event_id, patch) {
      const { error } = await sb
        .from('lovable_paddle_events')
        .update(patch)
        .eq('paddle_event_id', paddle_event_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  };
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

  // Clone before verifyWebhook consumes the body — we persist the raw
  // payload for audit.
  const cloned = req.clone();
  const rawBody = await cloned.text();

  let event: EventLikeWithId;
  try {
    event = (await verifyWebhook(req, env)) as EventLikeWithId;
  } catch (e) {
    console.error('paddle signature verification failed:', String(e));
    return new Response('Invalid signature', { status: 400 });
  }

  let result;
  try {
    result = await handleVerifiedEvent(
      buildDeps(),
      event,
      env,
      new Date(),
      safeParseJson(rawBody),
    );
  } catch (e) {
    console.error('handleVerifiedEvent threw:', String(e));
    // Uncaught throw → treat as transient, ask Paddle to retry.
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('payments-webhook result:', result.reason);
  return new Response(JSON.stringify({ status: result.reason }), {
    status: result.httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
});

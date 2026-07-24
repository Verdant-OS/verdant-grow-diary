/**
 * paddle-portal-session — mints a Paddle customer-portal URL for the
 * signed-in caller so they can cancel, update payment method, or view
 * invoices.
 *
 * SAFETY:
 *  - Requires a verified caller JWT (auth.getUser).
 *  - service_role read is scoped by the verified auth.uid() — a caller
 *    cannot mint a portal for anyone else's subscription.
 *  - Selects the caller's most recent recurring subscription (skips
 *    lifetime_ rows — Paddle has no portal surface for one-off purchases).
 *  - Env is derived from the subscription row's `environment` column, not
 *    from client input.
 *  - Returns { url } only; never the customer id, subscription id, or
 *    portal session id itself.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaddleClient, type PaddleEnv } from '../_shared/paddle.ts';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'auth_required' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(503, { error: 'unavailable' });
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: 'auth_required' });
    const uid = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Newest recurring subscription for this user (skip lifetime — no portal
    // surface for one-off purchases). Return the environment column verbatim
    // so we route to the matching sandbox/live gateway credentials.
    const { data: rows, error: subError } = await admin
      .from('subscriptions')
      .select('paddle_subscription_id, paddle_customer_id, environment, status')
      .eq('user_id', uid)
      .not('paddle_subscription_id', 'like', 'lifetime_%')
      .order('created_at', { ascending: false })
      .limit(1);
    if (subError) return json(503, { error: 'unavailable' });
    const sub = (rows ?? [])[0] as
      | {
          paddle_subscription_id: string;
          paddle_customer_id: string;
          environment: PaddleEnv;
          status: string;
        }
      | undefined;
    if (!sub) {
      // Distinguish "Founder Lifetime — nothing to manage" from "no
      // billing history at all" so the UI can render the right copy
      // instead of a misleading generic error. Lifetime rows are
      // recognised by the `lifetime_%` pseudo-subscription id shape
      // written by the webhook's record_lifetime path.
      const { data: lifetimeRows } = await admin
        .from('subscriptions')
        .select('paddle_subscription_id')
        .eq('user_id', uid)
        .like('paddle_subscription_id', 'lifetime_%')
        .limit(1);
      if ((lifetimeRows ?? []).length > 0) {
        return json(404, { error: 'lifetime_only' });
      }
      return json(404, { error: 'no_subscription' });
    }


    const paddle = getPaddleClient(sub.environment);
    let portal: { urls?: { general?: { overview?: string } } };
    try {
      portal = (await paddle.customerPortalSessions.create(
        sub.paddle_customer_id,
        [sub.paddle_subscription_id],
      )) as { urls?: { general?: { overview?: string } } };
    } catch (e) {
      console.error('portal_create_failed', String(e));
      return json(502, { error: 'portal_create_failed' });
    }
    const url = portal.urls?.general?.overview;
    if (!url) return json(502, { error: 'portal_create_failed' });

    return json(200, { url });
  } catch (e) {
    console.error('paddle-portal-session error', String(e));
    return json(503, { error: 'unavailable' });
  }
});

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * checkout-status — signed-in read-only endpoint used by CheckoutSuccess to
 * complement the entitlement poll.
 *
 * L4 (audit fix): the previous "still confirming…" state relied only on
 * the entitlement resolver, which reads from `subscriptions`. If a
 * transaction settled but the row hadn't been inserted yet (e.g. because
 * the price lookup was in flight), the buyer saw no signal that Paddle
 * had actually accepted the payment. This endpoint reports the most
 * recent processing_status for the caller from `lovable_paddle_events`,
 * which is populated the instant a signature-verified event arrives —
 * before the subscription row is written.
 *
 * SAFETY:
 *  - Requires a verified caller JWT (auth.getUser).
 *  - Reads with service_role but scopes the query by verified auth.uid()
 *    so the caller cannot inspect any other user's audit trail.
 *  - Never returns raw payload, Paddle IDs, or webhook secrets.
 *    Response shape: { status, event_type, updated_at } | { status: 'none' }.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { error: 'auth_required' });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(503, { error: 'status_unavailable' });
    }
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      return json(401, { error: 'auth_required' });
    }
    const uid = userData.user.id;

    // service_role read scoped to the verified caller only.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin
      .from('lovable_paddle_events')
      .select('processing_status, event_type, updated_at, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return json(503, { error: 'status_unavailable' });
    }
    if (!data) {
      return json(200, { status: 'none' });
    }
    return json(200, {
      status: (data as { processing_status?: string }).processing_status ?? 'unknown',
      event_type: (data as { event_type?: string }).event_type ?? null,
      updated_at:
        (data as { updated_at?: string }).updated_at ??
        (data as { created_at?: string }).created_at ??
        null,
    });
  } catch {
    return json(503, { error: 'status_unavailable' });
  }
});

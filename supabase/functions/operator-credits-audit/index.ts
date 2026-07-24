/**
 * operator-credits-audit — read-only, operator-only audit surface.
 *
 * SAFETY:
 *  - Requires a verified caller JWT (auth.getUser).
 *  - Server re-checks operator role via public.has_role(uid, 'operator').
 *    Non-operators receive 403 regardless of any UI-side gate.
 *  - Uses service_role only after the operator check passes; never trusts
 *    the client for role/identity.
 *  - Read-only: no writes, no mutations, no ability to grant/refund/spend.
 *  - Returns ONLY IDs, timestamps, enums, and integer counts. No email,
 *    no name, no profile fields. UUIDs are pseudo-anonymous account
 *    identifiers used for cross-referencing rows during troubleshooting.
 *
 * Response shape:
 *   {
 *     grants:      [{ id, user_id, credits, kind, sku, source, environment,
 *                     paddle_transaction_id, reverses, grant_ref,
 *                     expires_at, created_at }],
 *     spends:      [{ id, user_id, grow_id, period_key, weight, model_tier,
 *                     feature, status, refund_of, created_at }],
 *     refunds:     [{ ...spend row where refund_of IS NOT NULL }],
 *     referrals:   [{ id, referrer_user_id, referee_user_id, code, status,
 *                     referrer_credits, referee_credits, environment,
 *                     created_at, converted_at }],
 *     took_ms:     number
 *   }
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'auth_required' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(503, { error: 'unavailable' });

    // 1. Verify caller identity.
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: 'auth_required' });
    const uid = userData.user.id;

    // 2. Server-side operator role check via security-definer RPC. Never
    //    trust the client. Uses the same helper the RLS policies use.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: roleData, error: roleError } = await admin.rpc('has_role', {
      _user_id: uid,
      _role: 'operator',
    });
    if (roleError) return json(500, { error: 'role_check_failed' });
    if (roleData !== true) return json(403, { error: 'operator_required' });

    // 3. Optional query params (POST body preferred; GET query string OK).
    let limit = DEFAULT_LIMIT;
    let environment: string | null = null;
    if (req.method === 'POST') {
      try {
        const b = (await req.json()) as { limit?: unknown; environment?: unknown };
        limit = clampLimit(b?.limit);
        if (typeof b?.environment === 'string' && b.environment.length <= 32) {
          environment = b.environment;
        }
      } catch {
        // empty body OK
      }
    } else {
      const u = new URL(req.url);
      limit = clampLimit(u.searchParams.get('limit'));
      const env = u.searchParams.get('environment');
      if (env && env.length <= 32) environment = env;
    }

    // 4. Read-only queries. No writes anywhere in this function.
    let grantsQ = admin
      .from('ai_credit_grants')
      .select(
        'id, user_id, credits, kind, sku, source, environment, paddle_transaction_id, reverses, grant_ref, expires_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (environment) grantsQ = grantsQ.eq('environment', environment);

    const spendsQ = admin
      .from('ai_credit_spends')
      .select(
        'id, user_id, grow_id, period_key, weight, model_tier, feature, status, refund_of, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const refundsQ = admin
      .from('ai_credit_spends')
      .select(
        'id, user_id, grow_id, period_key, weight, model_tier, feature, status, refund_of, created_at',
      )
      .not('refund_of', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    let referralsQ = admin
      .from('referrals')
      .select(
        'id, referrer_user_id, referee_user_id, code, status, referrer_credits, referee_credits, environment, created_at, converted_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (environment) referralsQ = referralsQ.eq('environment', environment);

    const [grantsRes, spendsRes, refundsRes, referralsRes] = await Promise.all([
      grantsQ,
      spendsQ,
      refundsQ,
      referralsQ,
    ]);

    for (const r of [grantsRes, spendsRes, refundsRes, referralsRes]) {
      if (r.error) return json(500, { error: 'query_failed', detail: r.error.message });
    }

    return json(200, {
      grants: grantsRes.data ?? [],
      spends: spendsRes.data ?? [],
      refunds: refundsRes.data ?? [],
      referrals: referralsRes.data ?? [],
      limit,
      environment,
      took_ms: Date.now() - startedAt,
    });
  } catch {
    return json(500, { error: 'internal_error' });
  }
});

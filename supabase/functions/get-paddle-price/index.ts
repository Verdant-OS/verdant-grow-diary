import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { gatewayFetch, type PaddleEnv } from '../_shared/paddle.ts';
import { resolveServerBillingEnvironment } from '../_shared/unionEntitlementLookup.ts';

/**
 * Resolve a paid plan id to its public Paddle price ID. Read-only; no DB
 * writes.
 *
 * Hardened contract (paid-launch gate):
 *  - Only the paid plan allowlist is accepted: pro_monthly, pro_annual,
 *    founder_lifetime. Anything else fails closed with a sanitized error.
 *  - Requires a verified signed-in user (auth.getUser on the caller's JWT).
 *    Anonymous price scraping through our gateway credentials is not a
 *    supported surface.
 *  - Environment selection is SERVER-controlled via
 *    resolveServerBillingEnvironment (PAYMENTS_ENVIRONMENT, else key
 *    presence, else sandbox). A browser-supplied `environment` field is
 *    ignored entirely.
 *  - Returns ONLY the resolved public Paddle price id ({ paddleId }) — the
 *    same response contract the checkout client already consumes.
 *  - Errors are sanitized constants. No upstream error text, no gateway
 *    details, no key material, no echo of unexpected input.
 */

/** The only plans a price may be resolved for. Keep in lockstep with the
 * client planCatalog and the reconciliation RPC's plan checks. */
const PAID_PLAN_ALLOWLIST: ReadonlySet<string> = new Set([
  'pro_monthly',
  'pro_annual',
  'founder_lifetime',
]);

/**
 * Server-configured Paddle price IDs — the same source the webhook uses for
 * plan classification. Populated at cold-start from env so the map is built
 * once per instance. An empty string means the var is not configured; the
 * gateway result is then rejected rather than returned unvalidated.
 */
const SERVER_PRICE_CONFIG: Readonly<Record<string, string>> = {
  pro_monthly: Deno.env.get('PADDLE_PRICE_PRO_MONTHLY') ?? '',
  pro_annual: Deno.env.get('PADDLE_PRICE_PRO_ANNUAL') ?? '',
  founder_lifetime: Deno.env.get('PADDLE_PRICE_FOUNDER_LIFETIME') ?? '',
};

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
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  try {
    // 1. Verified signed-in user. The anon key + caller Authorization header
    //    means auth.getUser() re-validates the JWT against the auth server;
    //    no service_role anywhere in this function.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { error: 'auth_required' });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { error: 'price_resolution_unavailable' });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json(401, { error: 'auth_required' });
    }

    // 2. Plan allowlist. The request field keeps its legacy name (priceId)
    //    so the existing checkout client works unchanged, but only the three
    //    paid plan ids pass; everything else fails closed.
    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.priceId === 'string' ? body.priceId.trim() : '';
    if (!PAID_PLAN_ALLOWLIST.has(requested)) {
      return json(400, { error: 'unknown_plan' });
    }

    // 3. Server-controlled environment. Any client-supplied environment
    //    field is ignored — the server decides sandbox vs live.
    const environment: PaddleEnv = resolveServerBillingEnvironment();

    const response = await gatewayFetch(
      environment,
      `/prices?external_id=${encodeURIComponent(requested)}`,
    );
    if (!response.ok) {
      // Upstream/gateway problems (including an environment with no
      // configured credentials) fail closed without leaking detail.
      return json(502, { error: 'price_resolution_unavailable' });
    }
    const data = await response.json().catch(() => null);
    const paddleId = data?.data?.[0]?.id;

    if (typeof paddleId !== 'string' || paddleId.length === 0) {
      return json(404, { error: 'price_not_configured' });
    }

    // Validate the gateway result against the server-configured price ID for
    // this plan. If the sources have drifted (or the env var is not set), we
    // reject rather than return an ID the webhook would classify as
    // unknown_price_id and leave the buyer without an entitlement.
    const configuredId = SERVER_PRICE_CONFIG[requested] ?? '';
    if (configuredId.length === 0 || paddleId !== configuredId) {
      return json(502, { error: 'price_resolution_unavailable' });
    }

    return json(200, { paddleId });
  } catch (_err) {
    // Never surface upstream error text, stack, or configuration detail.
    return json(500, { error: 'price_resolution_unavailable' });
  }
});

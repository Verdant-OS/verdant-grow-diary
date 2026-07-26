import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";
import {
  loadUnionEntitlement,
  resolveServerBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";
import {
  CREDIT_PACK_IDS,
  PAID_PLAN_ALLOWLIST,
  PAID_PLAN_IDS,
} from "../_shared/lib/lib/paidPlanAllowlist.ts";
import { creditPackIsSpendable } from "../_shared/lib/lib/creditPackEligibility.ts";

/**
 * Resolve a paid plan id to its public Paddle price ID. Read-only; no DB
 * writes.
 *
 * Hardened contract (paid-launch gate):
 *  - Only the paid plan allowlist is accepted (see PAID_PLAN_IDS —
 *    single source of truth in src/lib/paidPlanAllowlist.ts, mirrored to
 *    supabase/functions/_shared/lib/). Anything else fails closed with a
 *    sanitized error.
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

/**
 * Server-configured Paddle price IDs — the same source the webhook uses for
 * plan classification (paddle-webhook/index.ts PADDLE_PRICE_CONFIG). Populated
 * at cold-start from env so the map is built once per instance. An empty
 * string means the var is not configured; the gateway result is then rejected
 * rather than returned unvalidated.
 *
 * Keys MUST cover every entry in PAID_PLAN_IDS — a cold-start drift guard
 * below throws if a plan id is added to the shared allowlist without a
 * corresponding env-var wiring here.
 */
const SERVER_PRICE_CONFIG: Readonly<Record<string, string>> = {
  pro_monthly: Deno.env.get("PADDLE_PRICE_PRO_MONTHLY") ?? "",
  pro_annual: Deno.env.get("PADDLE_PRICE_PRO_ANNUAL") ?? "",
  craft_monthly: Deno.env.get("PADDLE_PRICE_CRAFT_MONTHLY") ?? "",
  craft_annual: Deno.env.get("PADDLE_PRICE_CRAFT_ANNUAL") ?? "",
  founder_lifetime: Deno.env.get("PADDLE_PRICE_FOUNDER_LIFETIME") ?? "",
  credit_pack_50: Deno.env.get("PADDLE_PRICE_CREDIT_PACK_50") ?? "",
  credit_pack_150: Deno.env.get("PADDLE_PRICE_CREDIT_PACK_150") ?? "",
};

// Cold-start drift guard: fail loudly if PAID_PLAN_IDS gains an entry that
// SERVER_PRICE_CONFIG doesn't wire an env var for. Silent absence here would
// otherwise fail-closed only after a checkout attempt.
for (const id of PAID_PLAN_IDS) {
  if (!(id in SERVER_PRICE_CONFIG)) {
    throw new Error(`SERVER_PRICE_CONFIG missing env wiring for plan id: ${id}`);
  }
}


function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Structured, non-sensitive diagnostic log for catalog-unavailable branches.
 * Emits ONLY: plan id (allowlist enum), sanitized reason code, resolved
 * server environment, and whether the corresponding PADDLE_PRICE_* env var
 * is configured for that plan. Never logs: user id, JWT, gateway response
 * body, Paddle IDs, request headers, or any key material. Written to stderr
 * as a single JSON line so it is greppable in edge function logs without
 * being surfaced in any user-facing response.
 */
function logCatalogUnavailable(fields: {
  plan: string;
  reason:
    | "unknown_plan"
    | "price_not_configured"
    | "price_resolution_unavailable"
    | "plan_sold_out"
    | "auth_required"
    | "method_not_allowed"
    | "internal_error";
  environment?: "sandbox" | "live";
  envVarConfigured?: boolean;
  stage:
    | "auth"
    | "method"
    | "allowlist"
    | "founder_cap"
    | "gateway"
    | "gateway_body"
    | "config_drift"
    | "exception";
}): void {
  try {
    console.warn(
      JSON.stringify({
        event: "get_paddle_price_catalog_unavailable",
        plan: fields.plan || "(none)",
        reason: fields.reason,
        environment: fields.environment ?? "(unresolved)",
        env_var_configured: fields.envVarConfigured ?? null,
        stage: fields.stage,
      }),
    );
  } catch {
    // Telemetry must never break the resolver.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    logCatalogUnavailable({ plan: "", reason: "method_not_allowed", stage: "method" });
    return json(405, { error: "method_not_allowed" });
  }

  let requested = "";
  let environment: PaddleEnv | undefined;
  try {
    // 1. Verified signed-in user. The anon key + caller Authorization header
    //    means auth.getUser() re-validates the JWT against the auth server;
    //    no service_role anywhere in this function.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      logCatalogUnavailable({ plan: "", reason: "auth_required", stage: "auth" });
      return json(401, { error: "auth_required" });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      logCatalogUnavailable({
        plan: "",
        reason: "price_resolution_unavailable",
        stage: "auth",
      });
      return json(500, { error: "price_resolution_unavailable" });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      logCatalogUnavailable({ plan: "", reason: "auth_required", stage: "auth" });
      return json(401, { error: "auth_required" });
    }

    // 2. Plan allowlist. The request field keeps its legacy name (priceId)
    //    so the existing checkout client works unchanged, but only the three
    //    paid plan ids pass; everything else fails closed.
    const body = await req.json().catch(() => ({}));
    requested = typeof body?.priceId === "string" ? body.priceId.trim() : "";
    if (!PAID_PLAN_ALLOWLIST.has(requested)) {
      // Log ONLY that the request missed the allowlist; do not echo the
      // rejected input value (could be attacker-controlled or PII-shaped).
      logCatalogUnavailable({ plan: "(rejected)", reason: "unknown_plan", stage: "allowlist" });
      return json(400, { error: "unknown_plan" });
    }

    // 2a-bis. A credit pack tops up the MONTHLY AI bucket. `ai_credit_spend`
    //     only consults pack balance under `IF v_scope = 'per_month'`, and free
    //     grows are scoped per_grow — so a pack bought on a free plan lands in
    //     ai_credit_grants and NO spend path ever reads it. That is money taken
    //     for credits we can never deliver.
    //
    //     Enforced HERE, before a price is returned, for the same reason as the
    //     founder cap below: it is the last point where refusing costs the
    //     buyer nothing. A client-side gate alone is bypassable by calling this
    //     function directly, so the server is the authority; the predicate is
    //     shared with the client rather than duplicated.
    if ((CREDIT_PACK_IDS as readonly string[]).includes(requested)) {
      let packSpendable = false;
      try {
        const { entitlement } = await loadUnionEntitlement(
          supabase,
          resolveServerBillingEnvironment(),
          new Date(),
        );
        packSpendable = creditPackIsSpendable(entitlement);
      } catch {
        // Fail CLOSED: if we cannot confirm the buyer can spend the pack, we
        // must not sell it. An unusable purchase is worse than a retry.
        packSpendable = false;
      }
      if (!packSpendable) {
        logCatalogUnavailable({
          plan: requested,
          reason: "pack_requires_monthly_plan",
          stage: "entitlement",
        });
        return json(403, { error: "pack_requires_monthly_plan" });
      }
    }

    // 2b. Founder Lifetime is a capped one-time plan (75 slots). Block a
    //     sold-out checkout HERE, before a price is ever returned, so a user
    //     is never charged for a slot allocate_founder_lifetime would then
    //     refuse to entitle. The RPC exposes only an aggregate remaining count
    //     (no rows, no PII) and runs as the verified caller. It is the
    //     pre-payment guard; the allocation RPC's advisory-locked cap check
    //     stays the authoritative backstop for the tiny residual race between
    //     this read and settlement (operator refund case, per the runbook).
    if (requested === "founder_lifetime") {
      const { data: remaining, error: capError } = await supabase.rpc(
        "founder_lifetime_slots_remaining",
      );
      if (capError) {
        logCatalogUnavailable({
          plan: requested,
          reason: "price_resolution_unavailable",
          stage: "founder_cap",
        });
        // Fail closed: if availability cannot be proven, no founder checkout.
        return json(503, { error: "price_resolution_unavailable" });
      }
      if (typeof remaining !== "number" || remaining <= 0) {
        logCatalogUnavailable({
          plan: requested,
          reason: "plan_sold_out",
          stage: "founder_cap",
        });
        return json(409, { error: "plan_sold_out" });
      }
    }

    // 3. Server-controlled environment. Any client-supplied environment
    //    field is ignored — the server decides sandbox vs live.
    environment = resolveServerBillingEnvironment();

    const response = await gatewayFetch(
      environment,
      `/prices?external_id=${encodeURIComponent(requested)}`,
    );
    if (!response.ok) {
      logCatalogUnavailable({
        plan: requested,
        reason: "price_resolution_unavailable",
        environment,
        envVarConfigured: (SERVER_PRICE_CONFIG[requested] ?? "").length > 0,
        stage: "gateway",
      });
      // Upstream/gateway problems (including an environment with no
      // configured credentials) fail closed without leaking detail.
      return json(502, { error: "price_resolution_unavailable" });
    }
    const data = await response.json().catch(() => null);
    const paddleId = data?.data?.[0]?.id;

    if (typeof paddleId !== "string" || paddleId.length === 0) {
      logCatalogUnavailable({
        plan: requested,
        reason: "price_not_configured",
        environment,
        envVarConfigured: (SERVER_PRICE_CONFIG[requested] ?? "").length > 0,
        stage: "gateway_body",
      });
      return json(404, { error: "price_not_configured" });
    }

    // Validate the gateway result against the server-configured price ID for
    // this plan. If the sources have drifted (or the env var is not set), we
    // reject rather than return an ID the webhook would classify as
    // unknown_price_id and leave the buyer without an entitlement.
    const configuredId = SERVER_PRICE_CONFIG[requested] ?? "";
    if (configuredId.length === 0 || paddleId !== configuredId) {
      logCatalogUnavailable({
        plan: requested,
        reason: "price_resolution_unavailable",
        environment,
        envVarConfigured: configuredId.length > 0,
        stage: "config_drift",
      });
      return json(502, { error: "price_resolution_unavailable" });
    }

    return json(200, { paddleId });
  } catch (_err) {
    logCatalogUnavailable({
      plan: requested || "(none)",
      reason: "internal_error",
      environment,
      stage: "exception",
    });
    // Never surface upstream error text, stack, or configuration detail.
    return json(500, { error: "price_resolution_unavailable" });
  }
});

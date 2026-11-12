import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadUnionEntitlementForUser,
  resolveRequiredServerBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";
import {
  buildCheckoutSessionForm,
  buildCustomerForm,
  checkoutIdempotencyKey,
  checkoutSessionExpiresAt,
  customerIdempotencyKey,
  customerSearchQuery,
  hasBlockingStripeSubscription,
  isStripeCustomerId,
  parseCheckoutSessionUrl,
  pickCustomerFromSearch,
  planOpenCheckoutSessions,
  resolveStripeCheckoutConfig,
  stripePriceMatchesPlan,
  type StripeCheckoutRefusal,
} from "../_shared/stripeCheckoutRules.ts";
import { stripeRequest } from "../_shared/stripeApi.ts";

/**
 * Start a Stripe hosted Checkout for Verdant Pro (Slice B of
 * docs/specs/stripe-live-checkout-plan.md). Writes nothing to the database.
 *
 *  - The caller must be signed in: auth.getUser re-validates the JWT, and the
 *    user id comes from that verified user, never from the request body.
 *  - Body: { plan: "pro_monthly" | "pro_annual" }. Anything else is refused
 *    before any Stripe call.
 *  - The environment is server-controlled (PAYMENTS_ENVIRONMENT must be
 *    explicitly live or sandbox), and the Stripe key's own mode must match it.
 *  - A caller who already holds an active paid plan is refused, so one person
 *    cannot be charged twice for Pro. So is a caller whose Stripe customer
 *    already has a live or still-paying subscription (the window before the
 *    webhook writes our row).
 *  - The configured Stripe price must be the active USD price Verdant shows
 *    (Pro $12/mo, $99/yr); a mismatch fails closed.
 *  - One Stripe customer per user: reused from our row, then from Stripe's
 *    metadata search, else created once (idempotency key). Repeat starts in a
 *    ten-minute window share one Checkout Session (idempotency key).
 *  - "Stripe is not set up here" answers 503 stripe_not_configured, so the
 *    client can fall back to Paddle instead of showing a dead end.
 *  - Returns only { url }, a checkout.stripe.com address. Errors are fixed
 *    codes with no upstream text, key material or echo of input.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type LogReason =
  | StripeCheckoutRefusal
  | "method_not_allowed"
  | "auth_required"
  | "environment_unavailable"
  | "entitlement_unavailable"
  | "already_subscribed"
  | "customer_unavailable"
  | "stripe_unavailable"
  | "internal_error";

/** One JSON line, no user id, no keys, no Stripe ids, no request echo. */
function logRefusal(reason: LogReason, environment?: string): void {
  try {
    console.warn(
      JSON.stringify({
        event: "stripe_checkout_refused",
        reason,
        environment: environment ?? "(unresolved)",
      }),
    );
  } catch {
    // Telemetry must never break checkout.
  }
}

/** Error-level, separate event: a Stripe setup that is wrong, not just absent. */
function logMisconfiguration(reason: "price_mismatch", environment: string): void {
  try {
    console.error(JSON.stringify({ event: "stripe_checkout_misconfigured", reason, environment }));
  } catch {
    // Telemetry must never break checkout.
  }
}

const REFUSAL_STATUS: Readonly<Record<StripeCheckoutRefusal, number>> = {
  unknown_plan: 400,
  plan_not_sold: 400,
  secret_key_missing: 503,
  secret_key_mode_mismatch: 503,
  price_not_configured: 503,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    logRefusal("method_not_allowed");
    return json(405, { error: "method_not_allowed" });
  }

  let environment: "sandbox" | "live" | undefined;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      logRefusal("auth_required");
      return json(401, { error: "auth_required" });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      logRefusal("internal_error");
      return json(500, { error: "checkout_unavailable" });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user || typeof user.id !== "string" || user.id === "") {
      logRefusal("auth_required");
      return json(401, { error: "auth_required" });
    }

    const resolution = resolveRequiredServerBillingEnvironment();
    if (!resolution.ok) {
      logRefusal("environment_unavailable");
      return json(503, { error: "stripe_not_configured" });
    }
    environment = resolution.environment;

    const body = await req.json().catch(() => ({}));
    const config = resolveStripeCheckoutConfig({
      requestedPlan: body?.plan,
      environment,
      getEnv: (name) => Deno.env.get(name),
    });
    if (!config.ok) {
      logRefusal(config.reason, environment);
      const publicError =
        REFUSAL_STATUS[config.reason] === 400 ? config.reason : "stripe_not_configured";
      return json(REFUSAL_STATUS[config.reason], { error: publicError });
    }

    // Caller-JWT client with an explicit owner filter: RLS still applies.
    const resolved = await loadUnionEntitlementForUser(supabase, user.id, environment, new Date());
    if (resolved.lookupFailed) {
      logRefusal("entitlement_unavailable", environment);
      return json(503, { error: "checkout_unavailable" });
    }
    if (resolved.entitlement.isActive && resolved.entitlement.effectivePlanId !== "free") {
      logRefusal("already_subscribed", environment);
      return json(409, { error: "already_subscribed" });
    }

    const secretKey = config.secretKey;

    // The configured price must be what the site shows. Fail closed.
    const price = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/prices/${encodeURIComponent(config.priceId)}`,
    });
    if (!price.ok) {
      logRefusal("stripe_unavailable", environment);
      return json(502, { error: "checkout_unavailable" });
    }
    if (!stripePriceMatchesPlan(price.body, config.plan, environment)) {
      // A misconfiguration, not "not set up yet": logged as an error under
      // its own event so a cutover cannot look live while sales quietly
      // fall back to Paddle. The grower still falls back.
      logMisconfiguration("price_mismatch", environment);
      return json(503, { error: "stripe_price_mismatch" });
    }

    // One Stripe customer per user: our own row first, then Stripe's search
    // on the metadata we wrote, then a single idempotent create.
    let customerId: string | null = null;
    const { data: ownRows } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", environment)
      .eq("billing_provider", "stripe")
      .order("created_at", { ascending: false })
      .limit(1);
    const ownCustomer = Array.isArray(ownRows) ? ownRows[0]?.stripe_customer_id : null;
    if (isStripeCustomerId(ownCustomer)) customerId = ownCustomer;
    if (customerId === null) {
      const search = await stripeRequest({
        secretKey,
        method: "GET",
        path: `/customers/search?query=${encodeURIComponent(customerSearchQuery(user.id))}`,
      });
      if (search.ok) customerId = pickCustomerFromSearch(search.body, user.id);
    }
    if (customerId === null) {
      const created = await stripeRequest({
        secretKey,
        method: "POST",
        path: "/customers",
        form: buildCustomerForm({ userId: user.id }),
        idempotencyKey: customerIdempotencyKey(user.id, environment),
      });
      const createdId = created.ok ? (created.body as { id?: unknown } | null)?.id : null;
      if (isStripeCustomerId(createdId)) customerId = createdId;
    }
    if (customerId === null) {
      logRefusal("customer_unavailable", environment);
      return json(502, { error: "checkout_unavailable" });
    }

    // A completed checkout whose webhook has not landed yet still blocks.
    const existing = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
    });
    if (!existing.ok) {
      logRefusal("stripe_unavailable", environment);
      return json(502, { error: "checkout_unavailable" });
    }
    if (hasBlockingStripeSubscription(existing.body)) {
      logRefusal("already_subscribed", environment);
      return json(409, { error: "already_subscribed" });
    }

    // At most one payable session per grower: hand back an open one for the
    // same plan, expire any other, then create.
    const nowMs = Date.now();
    const openSessions = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=10`,
    });
    const openPlan = openSessions.ok
      ? planOpenCheckoutSessions(openSessions.body, {
          plan: config.plan,
          userId: user.id,
          nowSeconds: Math.floor(nowMs / 1000),
        })
      : null;
    if (openPlan === null) {
      logRefusal("stripe_unavailable", environment);
      return json(502, { error: "checkout_unavailable" });
    }
    for (const sessionId of openPlan.expireIds) {
      const expired = await stripeRequest({
        secretKey,
        method: "POST",
        path: `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      });
      if (!expired.ok) {
        logRefusal("stripe_unavailable", environment);
        return json(502, { error: "checkout_unavailable" });
      }
    }
    if (openPlan.reuseUrl !== null) return json(200, { url: openPlan.reuseUrl });

    const session = await stripeRequest({
      secretKey,
      method: "POST",
      path: "/checkout/sessions",
      form: buildCheckoutSessionForm({
        priceId: config.priceId,
        plan: config.plan,
        userId: user.id,
        customerId,
        expiresAt: checkoutSessionExpiresAt(nowMs),
      }),
      idempotencyKey: checkoutIdempotencyKey({
        userId: user.id,
        plan: config.plan,
        environment,
        customerId,
        nowMs,
        supersedes: openPlan.expireIds,
      }),
    });
    const url = session.ok ? parseCheckoutSessionUrl(session.body) : null;
    if (url === null) {
      logRefusal("stripe_unavailable", environment);
      return json(502, { error: "checkout_unavailable" });
    }
    return json(200, { url });
  } catch {
    logRefusal("internal_error", environment);
    return json(500, { error: "checkout_unavailable" });
  }
});

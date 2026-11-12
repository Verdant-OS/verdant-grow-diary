import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadUnionEntitlementForUser,
  resolveRequiredServerBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";
import {
  buildCheckoutSessionForm,
  parseCheckoutSessionUrl,
  resolveStripeCheckoutConfig,
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
 *    cannot be charged twice for Pro.
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
      return json(503, { error: "checkout_unavailable" });
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
        REFUSAL_STATUS[config.reason] === 400 ? config.reason : "checkout_unavailable";
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

    const session = await stripeRequest({
      secretKey: config.secretKey,
      method: "POST",
      path: "/checkout/sessions",
      form: buildCheckoutSessionForm({
        priceId: config.priceId,
        plan: config.plan,
        userId: user.id,
        customerEmail: typeof user.email === "string" ? user.email : null,
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

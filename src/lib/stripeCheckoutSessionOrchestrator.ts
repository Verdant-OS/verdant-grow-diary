/**
 * Test-mode Checkout Session orchestration. Stripe, auth, and storage are
 * injected so unit tests never touch the network. Founder Lifetime is refused
 * before any Stripe request. A live secret or a live Price is refused.
 */
import {
  assertStripePriceId,
  assertStripeTestSecret,
  classifyStripePlanId,
  isStripeTestCheckoutSessionId,
  STRIPE_API_VERSION,
  stripePriceEnvName,
  type StripeTestPlanId,
} from "@/lib/stripeTestModeCatalogRules";
import {
  buildStripeCheckoutForm,
  buildStripeReturnUrls,
  priceMatchesStripeCatalog,
  resolveStripeCheckoutReturnOrigin,
} from "@/lib/stripeCheckoutSessionRules";

export interface StripeFetchInit {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface StripeFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export interface CreateCheckoutDeps {
  getEnv: (name: string) => string | undefined;
  getUser: () => Promise<{ id: string } | null>;
  loadPackEligibility: (userId: string) => Promise<{ lookupFailed: boolean; eligible: boolean }>;
  lookupStripeCustomerId: (userId: string) => Promise<string | null>;
  stripeFetch: (url: string, init: StripeFetchInit) => Promise<StripeFetchResponse>;
}

export interface CheckoutSessionResult {
  status: number;
  body: { error: string } | { url: string };
}

function unavailable(): CheckoutSessionResult {
  return { status: 503, body: { error: "checkout_unavailable" } };
}

function stripeHeaders(secret: string, post: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (post) headers["Content-Type"] = "application/x-www-form-urlencoded";
  return headers;
}

export async function runCreateCheckoutSession(
  input: { planId: string; now: Date },
  deps: CreateCheckoutDeps,
): Promise<CheckoutSessionResult> {
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) return unavailable();

  const user = await deps.getUser();
  if (!user?.id) return { status: 401, body: { error: "auth_required" } };

  const plan = classifyStripePlanId(typeof input.planId === "string" ? input.planId : "");
  if (plan.kind === "retired") return { status: 410, body: { error: "plan_retired" } };
  if (plan.kind === "unknown") return { status: 400, body: { error: "unknown_plan" } };

  if (plan.kind === "credit_pack") {
    let eligibility: { lookupFailed: boolean; eligible: boolean };
    try {
      eligibility = await deps.loadPackEligibility(user.id);
    } catch {
      return unavailable();
    }
    if (eligibility.lookupFailed) return unavailable();
    if (!eligibility.eligible)
      return { status: 403, body: { error: "pack_requires_monthly_plan" } };
  }

  const secret = deps.getEnv("STRIPE_SECRET_KEY") ?? "";
  if (!assertStripeTestSecret(secret).ok) return unavailable();

  const origin = resolveStripeCheckoutReturnOrigin(deps.getEnv("STRIPE_CHECKOUT_RETURN_ORIGIN"));
  if (!origin.ok) return unavailable();

  const envName = stripePriceEnvName(plan.planId);
  const priceId = envName ? (deps.getEnv(envName) ?? "") : "";
  if (!assertStripePriceId(priceId).ok)
    return { status: 503, body: { error: "price_not_configured" } };

  const planId: StripeTestPlanId = plan.planId;
  let priceBody: unknown;
  try {
    const priceResponse = await deps.stripeFetch(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`,
      {
        method: "GET",
        headers: stripeHeaders(secret, false),
      },
    );
    if (!priceResponse.ok) return { status: 502, body: { error: "stripe_unavailable" } };
    priceBody = await priceResponse.json();
  } catch {
    return { status: 502, body: { error: "stripe_unavailable" } };
  }

  const verdict = priceMatchesStripeCatalog(planId, priceBody);
  if (verdict === "live") return { status: 502, body: { error: "price_not_test_mode" } };
  if (verdict !== "ok") return { status: 502, body: { error: "price_mismatch" } };

  let customerId: string | null = null;
  try {
    customerId = await deps.lookupStripeCustomerId(user.id);
  } catch {
    return unavailable();
  }

  const urls = buildStripeReturnUrls(origin.origin);
  const form = buildStripeCheckoutForm({
    mode: plan.mode,
    priceId,
    userId: user.id,
    planId: plan.planId,
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
    customerId,
  });

  let sessionBody: unknown;
  try {
    const sessionResponse = await deps.stripeFetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: stripeHeaders(secret, true),
      body: form,
    });
    if (!sessionResponse.ok) return { status: 502, body: { error: "stripe_unavailable" } };
    sessionBody = await sessionResponse.json();
  } catch {
    return { status: 502, body: { error: "stripe_unavailable" } };
  }

  if (sessionBody == null || typeof sessionBody !== "object") {
    return { status: 502, body: { error: "stripe_unavailable" } };
  }
  const session = sessionBody as Record<string, unknown>;
  if (session.livemode !== false) return { status: 502, body: { error: "price_not_test_mode" } };
  if (typeof session.id !== "string" || !isStripeTestCheckoutSessionId(session.id)) {
    return { status: 502, body: { error: "price_not_test_mode" } };
  }
  if (typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) {
    return { status: 502, body: { error: "stripe_unavailable" } };
  }
  return { status: 200, body: { url: session.url } };
}

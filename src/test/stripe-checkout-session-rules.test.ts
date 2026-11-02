import { describe, expect, it } from "vitest";
import { buildStripeCheckoutForm } from "@/lib/stripeCheckoutSessionRules";
import { runCreateCheckoutSession } from "@/lib/stripeCheckoutSessionOrchestrator";

const USER = { id: "00000000-0000-4000-8000-000000000001" };
const NOW = new Date("2026-11-01T16:00:00.000Z");
const ORIGIN = "http://127.0.0.1:8080";

function pricePayload(amount: number, livemode = false) {
  return {
    id: "price_test_pro_monthly",
    currency: "usd",
    unit_amount: amount,
    livemode,
    active: true,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  const calls: Array<{
    url: string;
    init: { method: string; body?: string; headers: Record<string, string> };
  }> = [];
  const base = {
    getEnv: (name: string) => {
      const values: Record<string, string> = {
        STRIPE_SECRET_KEY: "sk_test_fixture_only",
        STRIPE_CHECKOUT_RETURN_ORIGIN: ORIGIN,
        STRIPE_PRICE_PRO_MONTHLY: "price_test_pro_monthly",
        STRIPE_PRICE_CREDIT_PACK_50: "price_test_credit_pack_50",
      };
      return values[name];
    },
    getUser: async () => USER,
    loadPackEligibility: async () => ({ lookupFailed: false, eligible: true }),
    lookupStripeCustomerId: async () => null,
    stripeFetch: async (
      _url: string,
      init: { method: string; body?: string; headers: Record<string, string> },
    ) => {
      if (init.method === "GET") {
        return { ok: true, status: 200, json: async () => pricePayload(1200) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "cs_test_fixture",
          url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
          livemode: false,
        }),
      };
    },
  };
  const merged = { ...base, ...overrides };
  const fetchImpl = merged.stripeFetch;
  merged.stripeFetch = async (url, init) => {
    calls.push({ url, init });
    return fetchImpl(url, init);
  };
  return { calls, deps: merged };
}

describe("stripe checkout form", () => {
  it("builds a managed-payments session and server return URLs", () => {
    const body = buildStripeCheckoutForm({
      mode: "subscription",
      priceId: "price_test_pro_monthly",
      userId: USER.id,
      planId: "pro_monthly",
      successUrl: `${ORIGIN}/checkout/success`,
      cancelUrl: `${ORIGIN}/checkout/cancel`,
      customerId: "cus_testfixture",
    });
    expect(body).toContain("managed_payments%5Benabled%5D=true");
    expect(body).toContain("mode=subscription");
    expect(body).toContain("line_items%5B0%5D%5Bquantity%5D=1");
    expect(body).toContain(`client_reference_id=${USER.id}`);
    expect(body).toContain("subscription_data%5Bmetadata%5D%5Bplan_id%5D=pro_monthly");
    expect(body).toContain("customer=cus_testfixture");
    expect(body).not.toContain("sk_test_");
    expect(body).not.toContain("sk_live_");
  });
});

describe("runCreateCheckoutSession", () => {
  it("returns 410 for Founder before any Stripe fetch", async () => {
    const harness = deps();
    const result = await runCreateCheckoutSession(
      { planId: "founder_lifetime", now: NOW },
      harness.deps,
    );
    expect(result.status).toBe(410);
    expect(result.body).toEqual({ error: "plan_retired" });
    expect(harness.calls).toHaveLength(0);

    const hyphen = await runCreateCheckoutSession(
      { planId: "founder-lifetime", now: NOW },
      harness.deps,
    );
    expect(hyphen.status).toBe(410);
    expect(harness.calls).toHaveLength(0);
  });

  it("refuses an sk_live_ key with no network call", async () => {
    const harness = deps({
      getEnv: (name: string) => (name === "STRIPE_SECRET_KEY" ? "sk_live_fixture_only" : undefined),
    });
    const result = await runCreateCheckoutSession(
      { planId: "pro_monthly", now: NOW },
      harness.deps,
    );
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "checkout_unavailable" });
    expect(harness.calls).toHaveLength(0);
  });

  it("returns the hosted test URL only after the price matches the catalog", async () => {
    const harness = deps();
    const result = await runCreateCheckoutSession(
      { planId: "pro_monthly", now: NOW },
      harness.deps,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_fixture" });
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]?.url).toBe("https://api.stripe.com/v1/prices/price_test_pro_monthly");
    expect(harness.calls[0]?.init.headers.Authorization).toBe("Bearer sk_test_fixture_only");
    expect(harness.calls[0]?.init.headers["Stripe-Version"]).toBe("2026-02-25.preview");
    expect(harness.calls[1]?.init.method).toBe("POST");
    expect(harness.calls[1]?.init.body).toContain(
      "success_url=http%3A%2F%2F127.0.0.1%3A8080%2Fcheckout%2Fsuccess",
    );
    expect(harness.calls[1]?.init.body).not.toContain("sk_live_");
  });

  it("does not open a session when the Stripe price is live or the wrong amount", async () => {
    const live = deps({
      stripeFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => pricePayload(1200, true),
      }),
    });
    const liveResult = await runCreateCheckoutSession(
      { planId: "pro_monthly", now: NOW },
      live.deps,
    );
    expect(liveResult.status).toBe(502);
    expect(liveResult.body).toEqual({ error: "price_not_test_mode" });
    expect(live.calls).toHaveLength(1);

    const wrong = deps({
      stripeFetch: async () => ({ ok: true, status: 200, json: async () => pricePayload(1) }),
    });
    const wrongResult = await runCreateCheckoutSession(
      { planId: "pro_monthly", now: NOW },
      wrong.deps,
    );
    expect(wrongResult.status).toBe(502);
    expect(wrongResult.body).toEqual({ error: "price_mismatch" });
    expect(wrong.calls).toHaveLength(1);
  });

  it("blocks a credit pack when the caller has no paid plan", async () => {
    const harness = deps({
      loadPackEligibility: async () => ({ lookupFailed: false, eligible: false }),
    });
    const result = await runCreateCheckoutSession(
      { planId: "credit_pack_50", now: NOW },
      harness.deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "pack_requires_monthly_plan" });
    expect(harness.calls).toHaveLength(0);
  });

  it("requires a signed-in user and an allowlisted return origin", async () => {
    const anon = deps({ getUser: async () => null });
    expect(
      (await runCreateCheckoutSession({ planId: "pro_monthly", now: NOW }, anon.deps)).status,
    ).toBe(401);
    expect(anon.calls).toHaveLength(0);

    const origin = deps({
      getEnv: (name: string) => (name === "STRIPE_SECRET_KEY" ? "sk_test_fixture_only" : undefined),
    });
    const missing = await runCreateCheckoutSession(
      { planId: "pro_monthly", now: NOW },
      origin.deps,
    );
    expect(missing.status).toBe(503);
    expect(origin.calls).toHaveLength(0);
  });
});

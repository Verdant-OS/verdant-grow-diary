/**
 * Slice B (docs/specs/stripe-live-checkout-plan.md): pure rules that decide
 * whether a Stripe hosted Checkout may start, with which price and key.
 * Asserts resolved values, not source text.
 */
import { describe, expect, it } from "vitest";
import {
  STRIPE_CHECKOUT_PLAN_KEYS,
  STRIPE_PRO_EXPECTED_PRICES,
  buildCheckoutSessionForm,
  buildCustomerForm,
  checkoutIdempotencyKey,
  customerIdempotencyKey,
  customerSearchQuery,
  hasBlockingStripeSubscription,
  pickCustomerFromSearch,
  stripePriceMatchesPlan,
  keyModeMatchesEnvironment,
  parseCheckoutSessionUrl,
  resolveStripeCheckoutConfig,
  stripeKeyMode,
  stripePriceEnvName,
} from "../../supabase/functions/_shared/stripeCheckoutRules.ts";
import { PRICING } from "@/constants/pricing";

// Built from parts so secret scanners do not mistake fixtures for keys.
const LIVE_KEY = ["rk", "live", "fixture000"].join("_");
const TEST_KEY = ["sk", "test", "fixture000"].join("_");
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";

function envOf(values: Record<string, string>) {
  return (name: string) => values[name];
}

describe("stripe checkout plan keys", () => {
  it("sells Pro monthly and annual only", () => {
    expect([...STRIPE_CHECKOUT_PLAN_KEYS]).toEqual(["pro_monthly", "pro_annual"]);
  });

  it("names one price env per plan and environment", () => {
    expect(stripePriceEnvName("pro_monthly", "live")).toBe("STRIPE_PRICE_PRO_MONTHLY_LIVE");
    expect(stripePriceEnvName("pro_annual", "sandbox")).toBe("STRIPE_PRICE_PRO_ANNUAL_SANDBOX");
  });
});

describe("stripe key mode", () => {
  it("reads live and test secret or restricted keys from their prefix", () => {
    expect(stripeKeyMode("sk_live_x")).toBe("live");
    expect(stripeKeyMode("rk_live_x")).toBe("live");
    expect(stripeKeyMode("sk_test_x")).toBe("test");
    expect(stripeKeyMode("rk_test_x")).toBe("test");
  });

  it("rejects publishable keys, junk and non-strings", () => {
    expect(stripeKeyMode("pk_live_x")).toBeNull();
    expect(stripeKeyMode("live_x")).toBeNull();
    expect(stripeKeyMode(undefined)).toBeNull();
    expect(stripeKeyMode(42)).toBeNull();
  });

  it("never pairs a test key with live or a live key with sandbox", () => {
    expect(keyModeMatchesEnvironment(TEST_KEY, "live")).toBe(false);
    expect(keyModeMatchesEnvironment(LIVE_KEY, "sandbox")).toBe(false);
    expect(keyModeMatchesEnvironment(LIVE_KEY, "live")).toBe(true);
    expect(keyModeMatchesEnvironment(TEST_KEY, "sandbox")).toBe(true);
  });
});

describe("resolveStripeCheckoutConfig", () => {
  const liveEnv = {
    STRIPE_SECRET_KEY: LIVE_KEY,
    STRIPE_PRICE_PRO_MONTHLY_LIVE: "price_liveMonthly1",
    STRIPE_PRICE_PRO_ANNUAL_LIVE: "price_liveAnnual1",
  };

  it("resolves a configured live Pro plan to its price and key", () => {
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_annual",
        environment: "live",
        getEnv: envOf(liveEnv),
      }),
    ).toEqual({ ok: true, plan: "pro_annual", priceId: "price_liveAnnual1", secretKey: LIVE_KEY });
  });

  it("refuses plans that are not sold through Stripe before reading any key", () => {
    for (const plan of ["free", "founder_lifetime", "craft_monthly", "craft_annual"]) {
      expect(
        resolveStripeCheckoutConfig({
          requestedPlan: plan,
          environment: "live",
          getEnv: envOf({}),
        }),
      ).toEqual({ ok: false, reason: "plan_not_sold" });
    }
  });

  it("refuses unknown, empty and non-string plan values", () => {
    for (const plan of ["pro", "", "PRO_MONTHLY", null, undefined, 7, { plan: "pro_monthly" }]) {
      expect(
        resolveStripeCheckoutConfig({
          requestedPlan: plan,
          environment: "live",
          getEnv: envOf(liveEnv),
        }),
      ).toEqual({ ok: false, reason: "unknown_plan" });
    }
  });

  it("is off when the secret key is missing or blank", () => {
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "live",
        getEnv: envOf({ ...liveEnv, STRIPE_SECRET_KEY: "  " }),
      }),
    ).toEqual({ ok: false, reason: "secret_key_missing" });
  });

  it("refuses a test key in live and a live key in sandbox", () => {
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "live",
        getEnv: envOf({ ...liveEnv, STRIPE_SECRET_KEY: TEST_KEY }),
      }),
    ).toEqual({ ok: false, reason: "secret_key_mode_mismatch" });
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "sandbox",
        getEnv: envOf({ ...liveEnv, STRIPE_PRICE_PRO_MONTHLY_SANDBOX: "price_sandbox1" }),
      }),
    ).toEqual({ ok: false, reason: "secret_key_mode_mismatch" });
  });

  it("turns one plan off when its price env is unset or malformed (the interlock)", () => {
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "live",
        getEnv: envOf({ STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_PRICE_PRO_ANNUAL_LIVE: "price_a1" }),
      }),
    ).toEqual({ ok: false, reason: "price_not_configured" });
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "live",
        getEnv: envOf({ ...liveEnv, STRIPE_PRICE_PRO_MONTHLY_LIVE: "prod_notAPrice" }),
      }),
    ).toEqual({ ok: false, reason: "price_not_configured" });
  });

  it("never reads the sandbox price in live", () => {
    expect(
      resolveStripeCheckoutConfig({
        requestedPlan: "pro_monthly",
        environment: "live",
        getEnv: envOf({
          STRIPE_SECRET_KEY: LIVE_KEY,
          STRIPE_PRICE_PRO_MONTHLY_SANDBOX: "price_s1",
        }),
      }),
    ).toEqual({ ok: false, reason: "price_not_configured" });
  });
});

describe("buildCheckoutSessionForm", () => {
  it("binds the session and the subscription to the verified user and plan", () => {
    const form = new Map(
      buildCheckoutSessionForm({
        priceId: "price_liveMonthly1",
        plan: "pro_monthly",
        userId: USER,
        customerId: "cus_A1",
      }),
    );
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("price_liveMonthly1");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("client_reference_id")).toBe(USER);
    expect(form.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(form.get("subscription_data[metadata][plan_key]")).toBe("pro_monthly");
    expect(form.get("customer")).toBe("cus_A1");
    expect(form.has("customer_email")).toBe(false);
  });

  it("redirects only to fixed paths on the production host", () => {
    const form = new Map(
      buildCheckoutSessionForm({
        priceId: "price_a",
        plan: "pro_annual",
        userId: USER,
        customerId: "cus_A1",
      }),
    );
    expect(form.get("success_url")).toBe("https://verdantgrowdiary.com/checkout/success");
    expect(form.get("cancel_url")).toBe("https://verdantgrowdiary.com/pricing?checkout=canceled");
  });

  it("is deterministic for the same input", () => {
    const input = {
      priceId: "price_a",
      plan: "pro_annual" as const,
      userId: USER,
      customerId: "cus_A1",
    };
    expect(buildCheckoutSessionForm(input)).toEqual(buildCheckoutSessionForm(input));
  });
});

describe("parseCheckoutSessionUrl", () => {
  it("passes only an https checkout.stripe.com URL", () => {
    expect(parseCheckoutSessionUrl({ url: "https://checkout.stripe.com/c/pay/cs_live_a1" })).toBe(
      "https://checkout.stripe.com/c/pay/cs_live_a1",
    );
  });

  it("rejects any other host, scheme or shape", () => {
    for (const body of [
      { url: "https://checkout.stripe.com.evil.example/c/pay" },
      { url: "http://checkout.stripe.com/c/pay" },
      { url: "https://evil.example/?u=https://checkout.stripe.com" },
      { url: "javascript:alert(1)" },
      { url: 5 },
      {},
      null,
      "https://checkout.stripe.com/c/pay",
    ]) {
      expect(parseCheckoutSessionUrl(body)).toBeNull();
    }
  });
});

describe("Stripe price must match what the site shows", () => {
  it("expects the same Pro amounts as src/constants/pricing.ts, in cents", () => {
    expect(STRIPE_PRO_EXPECTED_PRICES.pro_monthly).toEqual({
      unitAmount: Math.round(PRICING.pro.monthlyPrice * 100),
      interval: "month",
    });
    expect(STRIPE_PRO_EXPECTED_PRICES.pro_annual).toEqual({
      unitAmount: Math.round(PRICING.pro.annualPrice * 100),
      interval: "year",
    });
  });

  const livePrice = (overrides: Record<string, unknown> = {}) => ({
    object: "price",
    active: true,
    livemode: true,
    currency: "usd",
    type: "recurring",
    unit_amount: 1200,
    recurring: { interval: "month", interval_count: 1 },
    ...overrides,
  });

  it("accepts the active live $12 monthly price for pro_monthly", () => {
    expect(stripePriceMatchesPlan(livePrice(), "pro_monthly", "live")).toBe(true);
    expect(
      stripePriceMatchesPlan(
        livePrice({ unit_amount: 9900, recurring: { interval: "year", interval_count: 1 } }),
        "pro_annual",
        "live",
      ),
    ).toBe(true);
  });

  it("fails closed on any amount, interval, currency, mode or state mismatch", () => {
    for (const overrides of [
      { unit_amount: 1999 },
      { recurring: { interval: "year", interval_count: 1 } },
      { recurring: { interval: "month", interval_count: 3 } },
      { recurring: null },
      { currency: "eur" },
      { livemode: false },
      { active: false },
      { type: "one_time" },
      { object: "product" },
    ]) {
      expect(stripePriceMatchesPlan(livePrice(overrides), "pro_monthly", "live")).toBe(false);
    }
    expect(stripePriceMatchesPlan(livePrice(), "pro_annual", "live")).toBe(false);
    expect(stripePriceMatchesPlan(null, "pro_monthly", "live")).toBe(false);
  });
});

describe("one customer and one checkout per grower", () => {
  it("blocks a second checkout while any subscription is live or still paying", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
      expect(hasBlockingStripeSubscription({ data: [{ status }] })).toBe(true);
    }
    expect(hasBlockingStripeSubscription({ data: [] })).toBe(false);
    expect(
      hasBlockingStripeSubscription({
        data: [{ status: "canceled" }, { status: "incomplete_expired" }],
      }),
    ).toBe(false);
  });

  it("fails closed when the subscription list is unreadable", () => {
    expect(hasBlockingStripeSubscription(null)).toBe(true);
    expect(hasBlockingStripeSubscription({ data: "x" })).toBe(true);
  });

  it("picks the caller's customer by our metadata, never by email", () => {
    expect(
      pickCustomerFromSearch(
        {
          data: [
            { id: "cus_other", metadata: { user_id: "someone-else" }, email: "grower@example.com" },
            { id: "cus_gone", deleted: true, metadata: { user_id: USER } },
            { id: "cus_mine", metadata: { user_id: USER } },
          ],
        },
        USER,
      ),
    ).toBe("cus_mine");
    expect(pickCustomerFromSearch({ data: [] }, USER)).toBeNull();
    expect(pickCustomerFromSearch(null, USER)).toBeNull();
  });

  it("builds a metadata-only search query that cannot be widened", () => {
    expect(customerSearchQuery(USER)).toBe(`metadata['user_id']:'${USER}'`);
    // Only UUID characters survive, so a value can never close the quote.
    expect(customerSearchQuery("x' OR email:'a")).toBe("metadata['user_id']:'eaa'");
  });

  it("writes the user id into a new customer's metadata", () => {
    expect(buildCustomerForm({ userId: USER, email: "grower@example.com" })).toEqual([
      ["metadata[user_id]", USER],
      ["email", "grower@example.com"],
    ]);
    expect(buildCustomerForm({ userId: USER, email: null })).toEqual([["metadata[user_id]", USER]]);
  });

  it("gives repeat starts in one ten-minute window the same idempotency key", () => {
    const base = {
      userId: USER,
      plan: "pro_monthly" as const,
      environment: "live" as const,
      customerId: "cus_A1",
    };
    const t = 1_794_500_400_000;
    expect(checkoutIdempotencyKey({ ...base, nowMs: t })).toBe(
      checkoutIdempotencyKey({ ...base, nowMs: t + 5_000 }),
    );
    expect(checkoutIdempotencyKey({ ...base, nowMs: t })).not.toBe(
      checkoutIdempotencyKey({ ...base, nowMs: t + 10 * 60 * 1000 }),
    );
    expect(checkoutIdempotencyKey({ ...base, nowMs: t })).not.toBe(
      checkoutIdempotencyKey({ ...base, plan: "pro_annual", nowMs: t }),
    );
    expect(customerIdempotencyKey(USER, "live")).toBe(`verdant-customer-live-${USER}`);
  });
});

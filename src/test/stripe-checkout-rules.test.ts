/**
 * Slice B (docs/specs/stripe-live-checkout-plan.md): pure rules that decide
 * whether a Stripe hosted Checkout may start, with which price and key.
 * Asserts resolved values, not source text.
 */
import { describe, expect, it } from "vitest";
import {
  STRIPE_CHECKOUT_PLAN_KEYS,
  buildCheckoutSessionForm,
  keyModeMatchesEnvironment,
  parseCheckoutSessionUrl,
  resolveStripeCheckoutConfig,
  stripeKeyMode,
  stripePriceEnvName,
} from "../../supabase/functions/_shared/stripeCheckoutRules.ts";

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
        customerEmail: "grower@example.com",
      }),
    );
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("price_liveMonthly1");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("client_reference_id")).toBe(USER);
    expect(form.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(form.get("subscription_data[metadata][plan_key]")).toBe("pro_monthly");
    expect(form.get("customer_email")).toBe("grower@example.com");
  });

  it("redirects only to fixed paths on the production host", () => {
    const form = new Map(
      buildCheckoutSessionForm({
        priceId: "price_a",
        plan: "pro_annual",
        userId: USER,
        customerEmail: null,
      }),
    );
    expect(form.get("success_url")).toBe("https://verdantgrowdiary.com/checkout/success");
    expect(form.get("cancel_url")).toBe("https://verdantgrowdiary.com/pricing?checkout=canceled");
    expect(form.has("customer_email")).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const input = {
      priceId: "price_a",
      plan: "pro_annual" as const,
      userId: USER,
      customerEmail: null,
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

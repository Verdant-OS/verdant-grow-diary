/**
 * Slice D (docs/specs/stripe-live-checkout-plan.md): the client picks the
 * provider, reads the function's answer and refuses to redirect anywhere but
 * Stripe's hosted checkout. Cheek picked Stripe; the switch takes effect only
 * in a build with VITE_PRO_CHECKOUT_PROVIDER=stripe, and otherwise stays on
 * Paddle so an early frontend never shows a dead Pro button.
 */
import { describe, expect, it } from "vitest";
import { PRO_CHECKOUT_PROVIDER, resolveProCheckoutProvider } from "@/config/checkoutProvider";
import { STRIPE_CHECKOUT_COPY } from "@/constants/stripeCheckoutCopy";
import {
  readStripeCheckoutUrl,
  shouldFallBackToPaddle,
  shouldUseStripeCheckout,
  stripeCheckoutErrorMessage,
} from "@/lib/stripeCheckoutClientRules";

describe("Pro checkout provider switch", () => {
  it("stays on Paddle in a build without VITE_PRO_CHECKOUT_PROVIDER=stripe", () => {
    expect(PRO_CHECKOUT_PROVIDER).toBe("paddle");
    expect(shouldUseStripeCheckout("pro_monthly", PRO_CHECKOUT_PROVIDER)).toBe(false);
  });

  it("turns Stripe on only for the exact flag value", () => {
    expect(resolveProCheckoutProvider("stripe")).toBe("stripe");
    for (const raw of [undefined, "", "paddle", "Stripe", "STRIPE", "true", "1", null]) {
      expect(resolveProCheckoutProvider(raw)).toBe("paddle");
    }
  });

  it("sends nothing to Stripe when the switch is on Paddle", () => {
    expect(shouldUseStripeCheckout("pro_monthly", "paddle")).toBe(false);
    expect(shouldUseStripeCheckout("pro_annual", "paddle")).toBe(false);
  });

  it("routes only Pro plans to Stripe when the switch says Stripe", () => {
    expect(shouldUseStripeCheckout("pro_monthly", "stripe")).toBe(true);
    expect(shouldUseStripeCheckout("pro_annual", "stripe")).toBe(true);
    for (const plan of ["free", "founder_lifetime", "craft_monthly", "credit_pack_50", "", null]) {
      expect(shouldUseStripeCheckout(plan, "stripe")).toBe(false);
    }
  });
});

describe("readStripeCheckoutUrl", () => {
  it("accepts only an https checkout.stripe.com URL", () => {
    expect(readStripeCheckoutUrl({ url: "https://checkout.stripe.com/c/pay/cs_live_1" })).toBe(
      "https://checkout.stripe.com/c/pay/cs_live_1",
    );
    for (const data of [
      { url: "https://checkout.stripe.com.evil.example/c" },
      { url: "http://checkout.stripe.com/c" },
      { url: "/pricing" },
      { error: "checkout_unavailable" },
      null,
      "https://checkout.stripe.com/c",
    ]) {
      expect(readStripeCheckoutUrl(data)).toBeNull();
    }
  });
});

describe("stripeCheckoutErrorMessage", () => {
  it("gives calm fixed copy and never echoes the code", () => {
    expect(stripeCheckoutErrorMessage("already_subscribed")).toBe(
      STRIPE_CHECKOUT_COPY.alreadySubscribed,
    );
    expect(stripeCheckoutErrorMessage("auth_required")).toBe(STRIPE_CHECKOUT_COPY.signInRequired);
    expect(stripeCheckoutErrorMessage("checkout_in_progress")).toBe(
      STRIPE_CHECKOUT_COPY.inProgress,
    );
    for (const code of ["checkout_unavailable", "plan_not_sold", "<script>", null]) {
      expect(stripeCheckoutErrorMessage(code)).toBe(STRIPE_CHECKOUT_COPY.unavailable);
    }
  });
});

describe("shouldFallBackToPaddle", () => {
  it("falls back when Stripe is not configured or not deployed", () => {
    expect(shouldFallBackToPaddle({ ok: false, code: "stripe_not_configured", status: 503 })).toBe(
      true,
    );
    expect(shouldFallBackToPaddle({ ok: false, code: null, status: 404 })).toBe(true);
    expect(shouldFallBackToPaddle({ ok: false, code: "stripe_price_mismatch", status: 503 })).toBe(
      true,
    );
  });

  it("does not fall back on real refusals or transient failures", () => {
    for (const result of [
      { ok: true },
      { ok: false, code: "already_subscribed", status: 409 },
      { ok: false, code: "auth_required", status: 401 },
      { ok: false, code: "checkout_unavailable", status: 502 },
      { ok: false, code: null, status: null },
    ]) {
      expect(shouldFallBackToPaddle(result)).toBe(false);
    }
  });
});

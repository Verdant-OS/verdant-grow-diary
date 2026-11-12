/**
 * Slice D (docs/specs/stripe-live-checkout-plan.md): the client picks the
 * provider, reads the function's answer and refuses to redirect anywhere but
 * Stripe's hosted checkout. The switch ships as "stripe" (Cheek's pick); a
 * "paddle" switch restores the previous Pro checkout.
 */
import { describe, expect, it } from "vitest";
import { PRO_CHECKOUT_PROVIDER } from "@/config/checkoutProvider";
import { STRIPE_CHECKOUT_COPY } from "@/constants/stripeCheckoutCopy";
import {
  readStripeCheckoutUrl,
  shouldUseStripeCheckout,
  stripeCheckoutErrorMessage,
} from "@/lib/stripeCheckoutClientRules";

describe("Pro checkout provider switch", () => {
  it("ships set to Stripe for new Pro sales (Cheek, 2026-11-12)", () => {
    expect(PRO_CHECKOUT_PROVIDER).toBe("stripe");
    expect(shouldUseStripeCheckout("pro_monthly", PRO_CHECKOUT_PROVIDER)).toBe(true);
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
    for (const code of ["checkout_unavailable", "plan_not_sold", "<script>", null]) {
      expect(stripeCheckoutErrorMessage(code)).toBe(STRIPE_CHECKOUT_COPY.unavailable);
    }
  });
});

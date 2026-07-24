import { describe, expect, it } from "vitest";

import {
  buildCheckoutActivationViewModel,
  CHECKOUT_ACTIVATION_STEPS,
} from "@/lib/checkoutActivationRules";

describe("checkout activation rules", () => {
  it("routes a confirmed purchase without a prior destination into grow setup", () => {
    expect(buildCheckoutActivationViewModel(null)).toMatchObject({
      primaryHref: "/grows",
      primaryLabel: "Start my grow memory",
    });
    expect(CHECKOUT_ACTIVATION_STEPS).toHaveLength(3);
  });

  it("preserves a safe same-origin return destination", () => {
    expect(buildCheckoutActivationViewModel("/pheno-hunts/new")).toMatchObject({
      primaryHref: "/pheno-hunts/new",
      primaryLabel: "Continue where I left off",
    });
  });

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])(
    "fails closed for unsafe return destination %s",
    (returnTo) => {
      expect(buildCheckoutActivationViewModel(returnTo).primaryHref).toBe("/grows");
    },
  );
});

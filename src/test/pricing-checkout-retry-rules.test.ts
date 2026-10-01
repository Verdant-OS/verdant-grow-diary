import { describe, expect, it } from "vitest";
import { CREDIT_PACKS } from "@/constants/pricing";
import { PAID_PLAN_IDS } from "@/lib/paidPlanAllowlist";
import { creditPackBlockedCopy, type CreditPackPurchaseGate } from "@/lib/creditPackEligibility";
import { resolvePricingCheckoutRetryGate } from "@/lib/pricingCheckoutRetryRules";

describe("Pricing checkout retry gate", () => {
  it.each(CREDIT_PACKS.map((pack) => pack.sku))(
    "allows verified %s without changing its identity",
    (sku) => {
      expect(resolvePricingCheckoutRetryGate(sku, { kind: "allowed" })).toEqual({
        allowed: true,
        message: null,
      });
    },
  );

  for (const pack of CREDIT_PACKS) {
    it.each(["signed_out", "no_monthly_bucket", "unverified"] as const)(
      `blocks ${pack.sku} retry with the existing %s explanation`,
      (reason) => {
        expect(resolvePricingCheckoutRetryGate(pack.sku, { kind: "blocked", reason })).toEqual({
          allowed: false,
          message: creditPackBlockedCopy(reason),
        });
      },
    );
    it(`keeps ${pack.sku} pending while eligibility loads`, () => {
      expect(resolvePricingCheckoutRetryGate(pack.sku, { kind: "pending" })).toEqual({
        allowed: false,
        message: "Checking your plan…",
      });
    });
    it.each([null, undefined])(`fails closed for absent ${pack.sku} eligibility: %s`, (gate) => {
      expect(resolvePricingCheckoutRetryGate(pack.sku, gate)).toEqual({
        allowed: false,
        message: creditPackBlockedCopy("unverified"),
      });
    });
  }

  it.each(PAID_PLAN_IDS.filter((sku) => !CREDIT_PACKS.some((pack) => pack.sku === sku)))(
    "preserves %s subscription retry without a paid-plan prerequisite",
    (sku) => {
      for (const gate of [
        null,
        undefined,
        { kind: "pending" } as const,
        { kind: "blocked", reason: "unverified" } as const,
      ]) {
        expect(resolvePricingCheckoutRetryGate(sku, gate)).toEqual({
          allowed: true,
          message: null,
        });
      }
    },
  );

  it.each([null, undefined, "", " ", "free", "unknown", " credit_pack_50 ", 50, {}, []])(
    "fails closed for invalid SKU %j even with an allowed pack gate",
    (sku) => {
      expect(resolvePricingCheckoutRetryGate(sku, { kind: "allowed" }).allowed).toBe(false);
    },
  );

  it("does not mutate inputs and is deterministic for identical inputs", () => {
    const gate: CreditPackPurchaseGate = Object.freeze({ kind: "blocked", reason: "unverified" });
    const first = resolvePricingCheckoutRetryGate("credit_pack_50", gate);
    expect(resolvePricingCheckoutRetryGate("credit_pack_50", gate)).toEqual(first);
    expect(gate).toEqual({ kind: "blocked", reason: "unverified" });
  });
});

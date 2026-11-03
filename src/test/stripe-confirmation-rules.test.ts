import { describe, expect, it, vi } from "vitest";
import {
  pollStripeConfirmation,
  stripeConfirmedPlanMatches,
  stripeSubscriptionMatchesSession,
} from "@/lib/payments/stripeConfirmationRules";

describe("matching Stripe confirmation", () => {
  it.each(["pro_monthly", "pro_annual", "craft_monthly", "craft_annual"])(
    "confirms only active matching %s access",
    (priceId) => {
      expect(
        stripeConfirmedPlanMatches(priceId, { isActive: true, effectivePlanId: priceId }),
      ).toBe(true);
      expect(
        stripeConfirmedPlanMatches(priceId, { isActive: false, effectivePlanId: priceId }),
      ).toBe(false);
      expect(stripeConfirmedPlanMatches(priceId, { isActive: true, effectivePlanId: "free" })).toBe(
        false,
      );
    },
  );
  it.each([null, undefined, "unknown", "credit_pack_50", "credit_pack_150"])(
    "does not claim %s grants a subscription",
    (priceId) => {
      expect(
        stripeConfirmedPlanMatches(priceId, { isActive: true, effectivePlanId: "pro_monthly" }),
      ).toBe(false);
    },
  );
  const session = { userId: "owner", priceId: "pro_monthly", customerId: "cus_owner" };
  it("rejects a subscription with another account, customer, or plan", () => {
    expect(stripeSubscriptionMatchesSession(session, session)).toBe(true);
    expect(stripeSubscriptionMatchesSession(session, { ...session, userId: "other" })).toBe(false);
    expect(stripeSubscriptionMatchesSession(session, { ...session, customerId: "cus_other" })).toBe(
      false,
    );
    expect(
      stripeSubscriptionMatchesSession(session, { ...session, priceId: "craft_monthly" }),
    ).toBe(false);
    expect(stripeSubscriptionMatchesSession(session, { customerId: "cus_owner" })).toBe(false);
  });
  it("retries pending settlement and stops after confirmation", async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValue({ state: "confirmed", priceId: "pro_monthly" });
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await pollStripeConfirmation(confirm, wait, () => true)).toEqual({
      state: "confirmed",
      priceId: "pro_monthly",
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
  it("stops after five pending attempts without claiming payment", async () => {
    const confirm = vi.fn().mockResolvedValue({ state: "pending" });
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await pollStripeConfirmation(confirm, wait, () => true)).toEqual({ state: "pending" });
    expect(confirm).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(4);
  });
  it("stops on errors without retrying", async () => {
    const confirm = vi.fn().mockResolvedValue({ error: "Ownership mismatch" });
    const wait = vi.fn();
    expect(await pollStripeConfirmation(confirm, wait, () => true)).toEqual({
      error: "Ownership mismatch",
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
  it("does not confirm after account change or unmount", async () => {
    let active = true;
    const confirm = vi.fn(async () => {
      active = false;
      return { state: "confirmed" };
    });
    expect(
      await pollStripeConfirmation(
        confirm,
        async () => {},
        () => active,
      ),
    ).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

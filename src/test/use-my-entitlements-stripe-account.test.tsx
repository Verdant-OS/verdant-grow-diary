import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "stripe-account" }, loading: false }),
}));
vi.mock("@/lib/stripeCheckoutRules", async (original) => ({
  ...(await original<typeof import("@/lib/stripeCheckoutRules")>()),
  stripeTokenEnvironment: () => "sandbox",
}));
import { useMyEntitlements } from "@/hooks/useMyEntitlements";

function query(table: string, rows: unknown[], pending = false) {
  let environment = "live";
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => {
      if (key === "environment") environment = value;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: { role: "staff" }, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
      (pending
        ? new Promise(() => {})
        : Promise.resolve({
            data: table === "subscriptions" && environment === "sandbox" ? rows : [],
            error: null,
          })
      ).then(resolve, reject),
  };
  return chain;
}

afterEach(() => vi.useRealTimers());
describe("Stripe account saved plan", () => {
  it("shows saved Craft test access independently of the staff Pro override", async () => {
    from.mockImplementation((table: string) =>
      query(table, [
        {
          user_id: "stripe-account",
          billing_provider: "stripe",
          paddle_subscription_id: null,
          paddle_customer_id: null,
          stripe_subscription_id: "sub_test",
          stripe_customer_id: "cus_test",
          product_id: "prod_test",
          price_id: "craft_annual",
          status: "active",
          environment: "sandbox",
          current_period_end: "2099-01-01T00:00:00Z",
        },
      ]),
    );
    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.savedStripeTestSubscription?.displayPlanId).toBe("craft_annual");
    expect(result.current.savedStripeTestSubscription?.isActive).toBe(true);
    expect(result.current.savedStripeTestSubscription?.isStaff).toBe(false);
  });
  it("does not report staff access as a saved Stripe purchase", async () => {
    from.mockImplementation((table: string) => query(table, []));
    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entitlement.isStaff).toBe(true);
    expect(result.current.savedStripeTestSubscription).toBeNull();
  });
  it("settles a stalled lookup as unavailable instead of loading forever", async () => {
    vi.useFakeTimers();
    from.mockImplementation((table: string) => query(table, [], true));
    const { result } = renderHook(() => useMyEntitlements());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.lookupFailed).toBe(true);
    expect(result.current.savedStripeTestSubscription).toBeNull();
  });
});

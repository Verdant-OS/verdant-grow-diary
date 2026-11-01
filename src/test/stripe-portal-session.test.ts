/**
 * Stripe customer-portal session minting — server core.
 *
 * The portal session is the only sanctioned way a signed-in grower reaches
 * Stripe-hosted cancellation / invoices. These tests pin the trust boundary:
 * the customer id comes from the caller's OWN saved subscription row
 * (RLS-scoped query by user_id), never from client input, and Stripe API
 * failures surface as a serializable { error } instead of a generic 500.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const stripeMock = vi.hoisted(() => ({
  portalCreate: vi.fn(),
}));

vi.mock("@/lib/stripe.server", () => ({
  createStripeClient: () => ({
    billingPortal: { sessions: { create: stripeMock.portalCreate } },
  }),
  getStripeErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Stripe request failed",
}));

import { createStripePortalSessionForUser } from "@/lib/payments/stripePortalSession.server";

interface QueryResult {
  data: { stripe_customer_id: string | null } | null;
  error: { message: string } | null;
}

function fakeSupabase(result: QueryResult) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result),
  };
  return { from: vi.fn(() => builder), builder };
}

beforeEach(() => {
  stripeMock.portalCreate.mockReset();
  stripeMock.portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/test_1" });
});

describe("createStripePortalSessionForUser", () => {
  it("mints a portal session for the caller's own saved Stripe customer", async () => {
    const { from, builder } = fakeSupabase({
      data: { stripe_customer_id: "cus_test_123" },
      error: null,
    });
    const result = await createStripePortalSessionForUser({
      supabase: from as never,
      userId: "user-1",
      environment: "sandbox",
      returnUrl: "https://verdantgrowdiary.com/settings",
    });
    expect(result).toEqual({ url: "https://billing.stripe.com/p/session/test_1" });
    expect(from).toHaveBeenCalledWith("subscriptions");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("environment", "sandbox");
    expect(builder.eq).toHaveBeenCalledWith("billing_provider", "stripe");
    expect(stripeMock.portalCreate).toHaveBeenCalledWith({
      customer: "cus_test_123",
      return_url: "https://verdantgrowdiary.com/settings",
    });
  });

  it("returns a calm error when the account has no saved Stripe subscription", async () => {
    const { from } = fakeSupabase({ data: null, error: null });
    const result = await createStripePortalSessionForUser({
      supabase: from as never,
      userId: "user-1",
      environment: "sandbox",
    });
    expect(result).toEqual({ error: "No Stripe subscription found on this account." });
    expect(stripeMock.portalCreate).not.toHaveBeenCalled();
  });

  it("returns a calm error when the subscription row has no Stripe customer", async () => {
    const { from } = fakeSupabase({ data: { stripe_customer_id: null }, error: null });
    const result = await createStripePortalSessionForUser({
      supabase: from as never,
      userId: "user-1",
      environment: "sandbox",
    });
    expect(result).toEqual({ error: "No Stripe subscription found on this account." });
    expect(stripeMock.portalCreate).not.toHaveBeenCalled();
  });

  it("surfaces the Stripe API error message instead of throwing a generic 500", async () => {
    stripeMock.portalCreate.mockRejectedValue(new Error("No such customer: cus_test_123"));
    const { from } = fakeSupabase({
      data: { stripe_customer_id: "cus_test_123" },
      error: null,
    });
    const result = await createStripePortalSessionForUser({
      supabase: from as never,
      userId: "user-1",
      environment: "sandbox",
    });
    expect(result).toEqual({ error: "No such customer: cus_test_123" });
  });

  it("returns a lookup error when the subscription read fails", async () => {
    const { from } = fakeSupabase({ data: null, error: { message: "rls denied" } });
    const result = await createStripePortalSessionForUser({
      supabase: from as never,
      userId: "user-1",
      environment: "sandbox",
    });
    expect(result).toEqual({ error: "Subscription lookup failed." });
    expect(stripeMock.portalCreate).not.toHaveBeenCalled();
  });
});

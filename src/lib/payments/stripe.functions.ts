import type Stripe from "stripe";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { stripeCatalogOffer } from "@/lib/stripeCheckoutRules";
import { stripeTokenEnvironment } from "@/lib/stripeCheckoutRules";
import { resolveUnionEntitlements, pickEntitlingLovableRow } from "@/lib/entitlements";
import { creditPackPurchaseEligible } from "@/lib/creditPackEligibility";
import { stripeConfirmedPlanMatches } from "./stripeConfirmationRules";
const environmentSchema = z.literal("sandbox"); // Owner approved test checkout only.
async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}
export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ priceId: z.string(), environment: environmentSchema, origin: z.string().url() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      if (stripeTokenEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) !== data.environment)
        throw new Error("Payment environment mismatch");
      const offer = stripeCatalogOffer(data.priceId);
      if (!offer) throw new Error("Price unavailable");
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const requestOrigin = request.headers.get("origin") ?? new URL(request.url).origin;
      const { isAllowedCheckoutReturnOrigin } = await import("./checkoutReturnOriginRules");
      if (!isAllowedCheckoutReturnOrigin(data.origin, requestOrigin))
        throw new Error("Invalid checkout return origin");
      const stripe = createStripeClient(data.environment);
      const { data: rows, error: rowsError } = await context.supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", context.userId)
        .eq("environment", data.environment)
        .order("created_at", { ascending: false })
        .limit(20);
      if (rowsError) throw new Error("Paid access could not be verified");
      const now = new Date();
      const entitlement = resolveUnionEntitlements({
        byoRow: null,
        lovableRow: pickEntitlingLovableRow(rows ?? [], data.environment, now),
        expectedBillingEnvironment: data.environment,
        now,
      });
      if (
        offer.kind === "subscription" &&
        entitlement.isActive &&
        entitlement.effectivePlanId !== "free"
      )
        throw new Error(
          "A paid plan already exists. Manage your subscription before starting another.",
        );
      if (offer.kind === "payment" && !creditPackPurchaseEligible(entitlement))
        throw new Error("A verified paid plan is required for credit packs.");
      const prices = await stripe.prices.list({ lookup_keys: [offer.id], active: true });
      const price = prices.data[0];
      if (
        !price ||
        price.unit_amount !== offer.amount ||
        price.currency !== offer.currency ||
        (offer.kind === "subscription"
          ? price.recurring?.interval !== offer.interval
          : price.type !== "one_time")
      )
        throw new Error("Stripe catalog does not match this offer");
      const customerId = await resolveOrCreateCustomer(stripe, {
        userId: context.userId,
        email: context.claims.email,
      });
      const product = await stripe.products.retrieve(
        typeof price.product === "string" ? price.product : price.product.id,
      );
      const metadata = { userId: context.userId, priceId: offer.id };
      const checkoutParams: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        mode: offer.kind,
        ui_mode: "embedded_page",
        return_url: `${data.origin}/checkout/stripe?session_id={CHECKOUT_SESSION_ID}`,
        metadata,
        ...(offer.kind === "subscription"
          ? { subscription_data: { metadata } }
          : { payment_intent_data: { description: product.name, metadata } }),
      };
      const session = await stripe.checkout.sessions.create(
        Object.assign(checkoutParams, {
          managed_payments: { enabled: true },
        }),
      );
      if (!session.client_secret) throw new Error("Stripe did not return a checkout secret");
      return { clientSecret: session.client_secret };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
export const confirmStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().regex(/^cs_test_[A-Za-z0-9]+$/),
        environment: environmentSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      if (stripeTokenEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) !== data.environment)
        throw new Error("Payment environment mismatch");
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const { fulfillStripeSession } = await import("./stripeFulfillment.server");
      const result = await fulfillStripeSession(session, data.environment, context.userId);
      if (result.state !== "confirmed" || "credits" in result) return result;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) throw new Error("Missing subscription");
      // Read back through the signed-in user's RLS client, not the privileged writer.
      const { data: saved, error } = await context.supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", context.userId)
        .eq("environment", data.environment)
        .eq("billing_provider", "stripe")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (error)
        throw new Error(
          "Payment was received, but saved plan access could not be verified. Retry confirmation.",
        );
      const access = resolveUnionEntitlements({
        byoRow: null,
        lovableRow: saved,
        expectedBillingEnvironment: data.environment,
        now: new Date(),
      });
      return stripeConfirmedPlanMatches(result.priceId, access)
        ? { ...result, planId: access.effectivePlanId }
        : { state: "pending" as const };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

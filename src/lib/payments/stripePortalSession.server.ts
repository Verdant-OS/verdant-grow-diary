/**
 * stripePortalSession.server — mints a Stripe Billing Portal session for
 * the signed-in caller's OWN saved Stripe subscription.
 *
 * Trust boundary: the customer id is read from the caller's subscription
 * row through their RLS-scoped client (select-own), never from client
 * input. Stripe API failures are returned as a serializable { error } so
 * TanStack's global request middleware cannot replace them with a
 * generic 500 (see stripe-shared-utility).
 */
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

export type StripePortalSessionResult = { url: string } | { error: string };

interface SubscriptionLookup {
  from(table: "subscriptions"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          eq(
            column: string,
            value: string,
          ): {
            order(
              column: string,
              options: { ascending: boolean },
            ): {
              limit(count: number): {
                maybeSingle(): PromiseLike<{
                  data: { stripe_customer_id: string | null } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
}

export async function createStripePortalSessionForUser(options: {
  supabase: SubscriptionLookup;
  userId: string;
  environment: StripeEnv;
  returnUrl?: string;
}): Promise<StripePortalSessionResult> {
  // Newest-first + limit(1): a returning user may have several historical
  // Stripe rows in one environment; `.single()` would error on >1 rows.
  const { data: sub, error: subError } = await options.supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", options.userId)
    .eq("environment", options.environment)
    .eq("billing_provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subError) return { error: "Subscription lookup failed." };
  if (!sub?.stripe_customer_id) return { error: "No Stripe subscription found on this account." };

  try {
    const stripe = createStripeClient(options.environment);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      ...(options.returnUrl && { return_url: options.returnUrl }),
    });
    return { url: portal.url };
  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}

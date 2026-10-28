/**
 * Client-side refusal for a Founder Lifetime checkout.
 *
 * Founder Lifetime is no longer sold. Existing holders keep their entitlement
 * through the server catalog; this guard only stops a new client checkout.
 * It does not touch edge functions, webhooks, or the database.
 */

export const FOUNDER_LIFETIME_CHECKOUT_REFUSAL =
  "Founder Lifetime is no longer for sale. Existing Founder access is unchanged.";

export function isFounderLifetimeCheckoutSku(priceId: string | null | undefined): boolean {
  if (typeof priceId !== "string") return false;
  const normalized = priceId.trim().toLowerCase();
  return normalized === "founder_lifetime" || normalized === "founder-lifetime";
}

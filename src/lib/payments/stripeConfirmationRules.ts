import { stripeCatalogOffer } from "@/lib/stripeCheckoutRules";

export const STRIPE_CONFIRMATION_ATTEMPTS = 5;
export const STRIPE_CONFIRMATION_DELAY_MS = 2000;

export function stripeConfirmedPlanMatches(
  priceId: unknown,
  access: { isActive: boolean; effectivePlanId: string },
): boolean {
  const offer = stripeCatalogOffer(priceId);
  return offer?.kind === "subscription" && access.isActive && access.effectivePlanId === offer.id;
}

export function stripeSubscriptionMatchesSession(
  session: { userId: string; priceId: string; customerId: string },
  subscription: { userId?: string; priceId?: string; customerId: string },
): boolean {
  return (
    session.userId === subscription.userId &&
    session.priceId === subscription.priceId &&
    session.customerId === subscription.customerId
  );
}

export async function pollStripeConfirmation<T extends { state: string } | { error: string }>(
  confirm: () => Promise<T>,
  wait: () => Promise<void>,
  isActive: () => boolean,
): Promise<T | null> {
  for (let attempt = 0; attempt < STRIPE_CONFIRMATION_ATTEMPTS && isActive(); attempt += 1) {
    const result = await confirm();
    if (!isActive()) return null;
    if (
      "error" in result ||
      result.state !== "pending" ||
      attempt === STRIPE_CONFIRMATION_ATTEMPTS - 1
    )
      return result;
    await wait();
  }
  return null;
}

import { stripeCatalogOffer } from '@/lib/stripeCheckoutRules';
export function stripeSubscriptionStatus(status: string): 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled' | 'expired' {
  switch (status) {
    case 'active': case 'trialing': case 'past_due': case 'paused': case 'canceled': return status;
    default: return 'expired';
  }
}
export function stripeSessionCanFulfill(input: { status: string | null; payment_status: string; livemode: boolean; metadata: Record<string, string> | null }, environment: 'sandbox' | 'live', userId?: string) {
  return input.livemode === (environment === 'live') && input.status === 'complete' &&
    (input.payment_status === 'paid' || input.payment_status === 'no_payment_required') &&
    !!input.metadata?.userId && (!userId || input.metadata.userId === userId) &&
    stripeCatalogOffer(input.metadata?.priceId) !== null;
}

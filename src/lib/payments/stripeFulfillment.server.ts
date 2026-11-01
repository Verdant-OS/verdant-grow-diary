import type Stripe from 'stripe';
import { createStripeClient, type StripeEnv } from '@/lib/stripe.server';
import { stripeCatalogOffer } from '@/lib/stripeCheckoutRules';
import { stripeSessionCanFulfill, stripeSubscriptionStatus } from './stripeFulfillmentRules';

export async function persistStripeSubscription(subscription: Stripe.Subscription, environment: StripeEnv) {
  const offer = stripeCatalogOffer(subscription.metadata.priceId);
  const item = subscription.items.data[0];
  if (!offer || offer.kind !== 'subscription' || !subscription.metadata.userId || !item || subscription.livemode !== (environment === 'live')) throw new Error('Invalid subscription evidence');
  if (item.price.lookup_key !== offer.id || item.price.unit_amount !== offer.amount || item.price.currency !== offer.currency) throw new Error('Subscription catalog mismatch');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: subscription.metadata.userId, billing_provider: 'stripe',
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    paddle_subscription_id: null, paddle_customer_id: null,
    product_id: typeof item.price.product === 'string' ? item.price.product : item.price.product.id,
    price_id: offer.id, status: stripeSubscriptionStatus(subscription.status),
    current_period_start: new Date(item.current_period_start * 1000).toISOString(),
    current_period_end: new Date(item.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end, environment,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'environment,stripe_subscription_id' });
  if (error) throw new Error(error.message);
}

export async function fulfillStripeSession(session: Stripe.Checkout.Session, environment: StripeEnv, userId?: string) {
  if (userId && session.metadata?.userId !== userId) throw new Error('Checkout does not belong to this account');
  if (!stripeSessionCanFulfill(session, environment, userId)) return { state: 'pending' as const };
  const stripe = createStripeClient(environment);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) throw new Error('Missing customer evidence');
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.metadata.userId !== session.metadata?.userId) throw new Error('Customer ownership mismatch');
  const offer = stripeCatalogOffer(session.metadata?.priceId);
  if (!offer) throw new Error('Unknown price');
  const lines = await stripe.checkout.sessions.listLineItems(session.id);
  const line = lines.data[0];
  if (lines.data.length !== 1 || line?.quantity !== 1 || line.price?.lookup_key !== offer.id || line.price.unit_amount !== offer.amount || line.price.currency !== offer.currency) throw new Error('Checkout catalog mismatch');
  if (offer.kind === 'subscription') {
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subscriptionId) throw new Error('Missing subscription');
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.metadata.userId !== session.metadata?.userId) throw new Error('Subscription ownership mismatch');
    await persistStripeSubscription(subscription, environment);
    return { state: 'confirmed' as const, priceId: offer.id };
  }
  const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentId) throw new Error('Missing settled payment');
  const payment = await stripe.paymentIntents.retrieve(paymentId);
  if (payment.status !== 'succeeded') return { state: 'pending' as const };
  const charges = await stripe.charges.list({ payment_intent: paymentId, limit: 1 });
  const refunded = charges.data.some(charge => charge.amount_refunded > 0);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.rpc('stripe_record_credit_payment', {
    p_environment: environment, p_payment_id: paymentId, p_user_id: customer.metadata.userId,
    p_price_id: offer.id, p_refunded: refunded,
  });
  if (error) throw new Error(error.message);
  return { state: refunded ? 'refunded' as const : 'confirmed' as const, priceId: offer.id, credits: refunded ? 0 : offer.credits };
}

import { createFileRoute } from '@tanstack/react-router';
import { createStripeClient } from '@/lib/stripe.server';
import { fulfillStripeSession, persistStripeSubscription } from '@/lib/payments/stripeFulfillment.server';
export const Route = createFileRoute('/api/public/payments/webhook')({
  server: { handlers: { POST: async ({ request }) => {
    const environment = new URL(request.url).searchParams.get('env');
    if (environment !== 'sandbox' && environment !== 'live') return new Response('Invalid environment', { status: 400 });
    try {
      const secret = process.env[environment === 'sandbox' ? 'PAYMENTS_SANDBOX_WEBHOOK_SECRET' : 'PAYMENTS_LIVE_WEBHOOK_SECRET'];
      const signature = request.headers.get('stripe-signature');
      if (!secret || !signature) return new Response('Missing signature configuration', { status: 400 });
      const stripe = createStripeClient(environment);
      const event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret);
      if (event.livemode !== (environment === 'live')) return new Response('Environment mismatch', { status: 400 });
      switch (event.type) {
        case 'customer.subscription.created': case 'customer.subscription.updated': {
          // Retrieve current state: a delayed older event must not revive canceled access.
          await persistStripeSubscription(await stripe.subscriptions.retrieve(event.data.object.id), environment);
          break;
        }
        case 'customer.subscription.deleted':
          await persistStripeSubscription(event.data.object, environment); break;
        case 'checkout.session.completed': case 'checkout.session.async_payment_succeeded':
          await fulfillStripeSession(await stripe.checkout.sessions.retrieve(event.data.object.id), environment); break;
        case 'charge.refunded': {
          const payment = event.data.object.payment_intent;
          const paymentId = typeof payment === 'string' ? payment : payment?.id;
          if (!paymentId) break;
          const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentId, limit: 1 });
          if (sessions.data[0]) await fulfillStripeSession(sessions.data[0], environment);
          break;
        }
      }
      return Response.json({ received: true });
    } catch {
      return new Response('Webhook verification or persistence failed', { status: 400 });
    }
  } } },
});

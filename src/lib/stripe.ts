import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { stripeTokenEnvironment } from '@/lib/stripeCheckoutRules';
let stripePromise: Promise<Stripe | null> | null = null;
export function getStripeEnvironment() {
  const env = stripeTokenEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
  if (!env) throw new Error('Stripe payments are not configured for this build.');
  return env;
}
export function getStripe() {
  getStripeEnvironment();
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
  return stripePromise;
}

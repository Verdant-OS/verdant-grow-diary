import { useEffect, useRef, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { createStripeCheckout } from '@/lib/payments/stripe.functions';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
export function StripeCheckoutPanel({ priceId, onClose }: { priceId: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // The panel mounts above the plan cards; bring it into view so the click visibly opens checkout.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sectionRef.current?.focus({ preventScroll: true });
  }, []);
  const [options] = useState(() => ({ fetchClientSecret: async () => {
    try {
      const result = await createStripeCheckout({ data: { priceId, environment: getStripeEnvironment(), origin: window.location.origin } });
      if ('error' in result) throw new Error(result.error);
      return result.clientSecret;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Checkout could not open';
      setError(message); throw new Error(message);
    }
  } }));
  return <section ref={sectionRef} tabIndex={-1} data-testid="stripe-checkout-panel" aria-label="Stripe checkout" className="mx-auto max-w-3xl px-6 py-6 scroll-mt-24 outline-none">
    <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Test checkout</h2><Button variant="ghost" size="icon" aria-label="Close checkout" onClick={onClose}><X /></Button></div>
    {error ? <p role="alert" className="text-destructive">{error}</p> : <EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}
  </section>;
}

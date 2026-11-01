import { useCallback, useState } from 'react';
import { useAuth } from '@/store/auth';
import { useNavigate } from '@/lib/react-router-compat';
import { StripeCheckoutPanel } from '@/components/StripeCheckoutPanel';
import { stripeTokenEnvironment, stripeCatalogOffer } from '@/lib/stripeCheckoutRules';
export function useStripeCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [priceId, setPriceId] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const environment = stripeTokenEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
  const openCheckout = useCallback(async (options: { priceId: string }) => {
    setBlockedReason(null);
    if (environment !== 'sandbox') { setBlockedReason('Only test checkout is enabled.'); return; }
    if (!stripeCatalogOffer(options.priceId)) { setBlockedReason('Price unavailable.'); return; }
    if (!user) { navigate(`/auth?mode=signin&redirectTo=${encodeURIComponent(`/pricing?plan=${options.priceId}`)}`); return; }
    setPriceId(options.priceId);
  }, [environment, user, navigate]);
  return { openCheckout, loading: false, environment: environment === 'sandbox' ? 'sandbox' as const : 'unavailable' as const,
    unavailable: environment !== 'sandbox', unavailableMessage: environment === 'sandbox' ? null : 'Only test checkout is enabled.',
    blockedReason, blockedReasonCode: null, blockedScope: blockedReason ? 'checkout' as const : null,
    dismissBlocked: () => setBlockedReason(null),
    checkoutElement: priceId ? <StripeCheckoutPanel key={priceId} priceId={priceId} onClose={() => setPriceId(null)} /> : null };
}

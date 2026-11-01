import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { confirmStripeCheckout } from '@/lib/payments/stripe.functions';
import { getStripeEnvironment } from '@/lib/stripe';
import { useAuth } from '@/store/auth';
import { useMyEntitlements } from '@/hooks/useMyEntitlements';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/react-router-compat';
export const Route = createFileRoute('/checkout/stripe')({
  validateSearch: (search: Record<string, unknown>) => ({ session_id: typeof search.session_id === 'string' && /^cs_test_[A-Za-z0-9]+$/.test(search.session_id) ? search.session_id : undefined }),
  head: () => ({ meta: [{ title: 'Test purchase confirmation | Verdant Grow Diary' }, { name: 'description', content: 'Verify your Verdant test subscription or purchased AI credits.' }, { property: 'og:title', content: 'Verdant test purchase confirmation' }, { property: 'og:description', content: 'Verified subscription and AI credit purchase status.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: StripeReturn,
});
function StripeReturn() {
  const { session_id } = Route.useSearch();
  const { user, loading } = useAuth();
  const { entitlement, refetch } = useMyEntitlements();
  const [message, setMessage] = useState('Checking payment…');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!user) { setMessage('Sign in to verify this purchase.'); return; }
    if (!session_id) { setMessage('No valid test checkout was provided.'); return; }
    let active = true;
    const confirm = async () => {
      try {
        const result = await confirmStripeCheckout({ data: { sessionId: session_id, environment: getStripeEnvironment() } });
        if (!active) return;
        if ('error' in result) { setMessage(result.error); return; }
        setConfirmed(result.state === 'confirmed');
        setMessage(result.state === 'confirmed' ? ('credits' in result ? `${result.credits} test AI credits confirmed.` : 'Your test subscription is confirmed.') : result.state === 'refunded' ? 'This purchase was refunded.' : 'Payment is pending. No new access has been granted.');
        await refetch();
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Purchase could not be verified.'); }
    };
    void confirm();
    return () => { active = false; };
  }, [loading, user?.id, session_id, refetch]);
  return <main className="mx-auto max-w-2xl px-6 py-12"><h1 className="mb-6 text-3xl font-semibold">Verdant test purchase</h1><p role="status">{message}</p>{confirmed && <p className="mt-4">Current access: {entitlement.isActive ? entitlement.displayPlanId.replaceAll('_', ' ') : 'checking paid access'}</p>}<Link to="/pricing"><Button variant="outline" className="mt-6">Back to pricing</Button></Link></main>;
}

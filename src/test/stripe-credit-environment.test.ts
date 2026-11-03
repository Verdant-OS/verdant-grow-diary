import { expect, it } from 'vitest';
import { stripeCreditsVisibleInEnvironment } from '@/lib/payments/stripeValidationRules';
it('test Stripe credits cannot fund live model calls', () => expect(stripeCreditsVisibleInEnvironment('stripe_credit_pack','sandbox','live')).toBe(false));
it('test Stripe credits are visible to test spending only', () => expect(stripeCreditsVisibleInEnvironment('stripe_credit_pack','sandbox','sandbox')).toBe(true));
it('live Stripe credits remain visible in both contexts', () => { expect(stripeCreditsVisibleInEnvironment('stripe_credit_pack','live','live')).toBe(true); expect(stripeCreditsVisibleInEnvironment('stripe_credit_pack','live','sandbox')).toBe(true); });

import { describe, it, expect } from 'vitest';
import { stripeSessionCanFulfill, stripeSubscriptionStatus } from '@/lib/payments/stripeFulfillmentRules';
import { resolveUnionEntitlements } from '@/lib/entitlements';
import { creditPackPurchaseEligible } from '@/lib/creditPackEligibility';
const session = { status: 'complete', payment_status: 'paid', livemode: false, metadata: { userId: 'user-1', priceId: 'pro_monthly' } };
const row = { user_id: 'user-1', paddle_subscription_id: null, paddle_customer_id: null, stripe_subscription_id: 'sub_test', stripe_customer_id: 'cus_test', billing_provider: 'stripe', product_id: 'software', price_id: 'pro_monthly', status: 'active', environment: 'sandbox', current_period_end: '2026-12-01T00:00:00Z' };
const now = new Date('2026-11-01T00:00:00Z');
describe('Stripe settlement fences', () => {
 it('accepts settled same-user test purchases', () => expect(stripeSessionCanFulfill(session, 'sandbox', 'user-1')).toBe(true));
 it.each(['unpaid','unknown'])('rejects %s payment status', payment_status => expect(stripeSessionCanFulfill({...session,payment_status},'sandbox','user-1')).toBe(false));
 it('rejects open sessions', () => expect(stripeSessionCanFulfill({...session,status:'open'},'sandbox')).toBe(false));
 it('rejects cross-user confirmation', () => expect(stripeSessionCanFulfill(session,'sandbox','user-2')).toBe(false));
 it('rejects test purchases as live evidence', () => expect(stripeSessionCanFulfill(session,'live')).toBe(false));
 it('rejects missing and retired offer evidence', () => { expect(stripeSessionCanFulfill({...session,metadata:null},'sandbox')).toBe(false); expect(stripeSessionCanFulfill({...session,metadata:{userId:'user-1',priceId:'founder_lifetime'}},'sandbox')).toBe(false); });
 it('treats unsupported initial subscription statuses as expired', () => expect(stripeSubscriptionStatus('incomplete')).toBe('expired'));
});
describe('Stripe canonical access', () => {
 it('unlocks Pro test access with 100 monthly credits and paid pack eligibility', () => { const entitlement=resolveUnionEntitlements({byoRow:null,lovableRow:row,expectedBillingEnvironment:'sandbox',now}); expect(entitlement.effectivePlanId).toBe('pro_monthly'); expect(entitlement.capabilities.aiMonthlyCredits).toBe(100); expect(creditPackPurchaseEligible(entitlement)).toBe(true); });
 it('does not unlock production from a test row', () => expect(resolveUnionEntitlements({byoRow:null,lovableRow:row,expectedBillingEnvironment:'live',now}).effectivePlanId).toBe('free'));
 it('does not turn a credit pack into paid plan access', () => expect(resolveUnionEntitlements({byoRow:null,lovableRow:{...row,price_id:'credit_pack_50'},expectedBillingEnvironment:'sandbox',now}).effectivePlanId).toBe('free'));
 it('rejects missing Stripe customer identity', () => expect(resolveUnionEntitlements({byoRow:null,lovableRow:{...row,stripe_customer_id:null},expectedBillingEnvironment:'sandbox',now}).effectivePlanId).toBe('free'));
});

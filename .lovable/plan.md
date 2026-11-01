# Complete Verdant’s Stripe payment switch

## Already completed
Built-in Stripe is enabled in test mode. Matching test prices exist: Pro $12/month or $99/year; Craft $29/month or $249/year; 50 AI credits $9; 150 AI credits $19. Founder Lifetime remains retired. Live onboarding is incomplete: claim the account in Payments first.

## Implementation
1. Replace new-purchase Paddle checkout with embedded Stripe checkout using existing pricing constants and stable price keys. Preserve unavailable states and the checkout kill switch.
2. Verify identity server-side; reject unknown prices, duplicate paid subscriptions and ineligible credit-pack purchases. Never trust client-supplied identity or grant access from the return page.
3. Add signature-verified, idempotent Stripe subscription, renewal, cancellation, failed-payment, credit-grant and refund handling. Reuse existing entitlement and append-only credit rules.
4. Adapt account billing and payment status to the provider. Preserve existing Paddle subscriber and Founder records; verify ongoing Paddle billing continuity rather than assume disconnection preserves it.
5. Configure full compliance handling for eligible new transactions, with matching product tax codes. Additional cost: 3.5% plus standard processing; statements show LINK.COM* with the seller descriptor.

## Technical scope
- Pricing/checkout, payment return/status, account billing and test-mode notice.
- Authenticated checkout and portal server functions; signature-verified `/api/public/payments/webhook`; shared gateway-backed Stripe utility.
- Existing `public.subscriptions` requires Paddle IDs and lacks Stripe ID fields. Prepare an additive compatibility migration preserving rows, ownership protections and the canonical entitlement authority. Audit credit-grant/refund constraints before extending them.
- No rewritten migrations, auth-setting changes, publishing, real charges or production SQL apply.

## Approval boundary
Approval authorizes preparing code and an additive migration only. Applying that migration, deployment/publishing and production acceptance need separate explicit owner approval; the production database lock remains.

## Validation
- Focused checkout, subscription, entitlement, credit and refund tests; automatic typecheck/build results. No full Vitest suite.
- Test invalid signatures, duplicate/out-of-order events, ownership isolation, environment separation, cancellation timing, failed payments and duplicate credit grants.
- Local mocked fixtures validate code only. Hosted verification follows the production-only runbook after the reviewed fix is live and the owner approves the disposable fixture.
- A separately authorized test-mode payment uses 4242 4242 4242 4242, future expiry and any three-digit CVC. Never use a test card in live checkout or complete a real charge.

## Risks and rollback
Payments are enabled but checkout is not converted: customer payment readiness is NOT_MEASURED. Keep new checkout disabled until fulfillment is verified. Roll back checkout code without deleting paid records or credit ledger entries; preserve old subscriber continuity.

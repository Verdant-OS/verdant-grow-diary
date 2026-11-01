# Current tasks

- [x] Repair missing sensor row fields without behavior changes; automatic typecheck/build OK and 181 focused tests passed.
- [x] Enable built-in Stripe and recreate the four active products with six matching test prices.
- [ ] Implement Stripe checkout, subscription renewal, credit fulfillment and account billing while preserving existing Paddle subscribers. BLOCKED: production database lock requires owner approval for additive subscription compatibility changes; implementation plan pending.
- [ ] Verify checkout and paid-access updates; real payments remain blocked until owner completes Stripe account claim and live onboarding.
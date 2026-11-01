# Current tasks

- [x] Repair missing sensor row fields without behavior changes; automatic typecheck/build OK and 181 focused tests passed.
- [x] Enable built-in Stripe and recreate the four active products with six matching test prices.
- [x] Add and test fail-closed Stripe token/catalog guards and a visible checkout-unavailable notice (16 focused tests; automatic typecheck/build OK).
- [ ] Implement Stripe checkout, subscription renewal, credit fulfillment and account billing while preserving existing Paddle subscribers. BLOCKED: the available migration tool applies directly, conflicting with the approved prepare-only plan and production database lock. Owner approval for applying additive compatibility changes is required.
- [ ] Verify checkout and paid-access updates; real payments remain blocked until owner completes Stripe account claim and live onboarding.
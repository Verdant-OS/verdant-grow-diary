# Current tasks

- [x] Repair missing sensor row fields without behavior changes; automatic typecheck/build OK and 181 focused tests passed.
- [x] Enable built-in Stripe and recreate the four active products with six matching test prices.
- [x] Add and test fail-closed Stripe token/catalog guards and a visible checkout-unavailable notice (16 focused tests; automatic typecheck/build OK).
- [x] Apply owner-approved Stripe subscription/credit compatibility and test-credit isolation; enable six test price checkouts and verified confirmation. Existing Paddle records preserved.
- [ ] Production renewal webhook activation and account billing are not deployed: requires owner release approval; no production publish performed.
- [ ] Complete an end-to-end test purchase: Stripe form opens, but two submitted fake-card attempts stayed open/unpaid. Owner manual test needed; no paid unlock claimed. 60 focused tests passed, automatic build/typecheck OK. Live readiness check remains outstanding.
- [x] Scaffold six branded authentication email templates and secure managed routes; sender domain verified.
- [ ] Authentication email delivery on the published site awaits owner release approval and a delivery test.
- [ ] Verify matching Stripe test-plan confirmation with bounded settlement retries and owner-scoped readback; preserve test/live isolation.

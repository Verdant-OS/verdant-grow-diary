# Current tasks

- [x] Add account navigation after exact-plan Stripe confirmation. Existing ownership, settlement, and account tests: 45 passed across 4 files.
- [ ] Requested successful test purchase and matching account readback remain blocked: two completed card submissions did not return confirmation; account still reports staff Pro and no saved Stripe test subscription. Manual preview payment required; no live charge or publish authorized.

- [x] Bound stalled Subscription lookups and show saved Stripe test plans separately from staff access; signed-in Settings loads. Account readback found no saved Stripe subscription. 22 targeted tests passed, automatic build OK; no purchase or billing write performed.

- [x] Apply approved feedback, contact, and lead INSERT policy repairs; database readback confirms bounded public submissions and blocked support attribution/review fields. 23 existing targeted tests passed; live submission harness not run. Database linter reports 47 other findings, with no tautological INSERT finding.

- [x] Repair missing sensor row fields without behavior changes; automatic typecheck/build OK and 181 focused tests passed.
- [x] Enable built-in Stripe and recreate the four active products with six matching test prices.
- [x] Add and test fail-closed Stripe token/catalog guards and a visible checkout-unavailable notice (16 focused tests; automatic typecheck/build OK).
- [x] Apply owner-approved Stripe subscription/credit compatibility and test-credit isolation; enable six test price checkouts and verified confirmation. Existing Paddle records preserved.
- [ ] Production renewal webhook activation and account billing are not deployed: requires owner release approval; no production publish performed.
- [ ] Complete an end-to-end test purchase: Stripe form opens, but two submitted fake-card attempts stayed open/unpaid. Owner manual test needed; no paid unlock claimed. 60 focused tests passed, automatic build/typecheck OK. Live readiness check remains outstanding.
- [x] Scaffold six branded authentication email templates and secure managed routes; sender domain verified.
- [ ] Authentication email delivery on the published site awaits owner release approval and a delivery test.
- [x] Add bounded Stripe settlement retries, exact subscription/customer/plan matching, and owner-scoped saved-access readback. 46 targeted tests passed; test/live isolation retained.
- [ ] Verify settled test purchase through the UI: signed-in browser navigation timed out; previous two card attempts stayed unpaid, so owner manual purchase remains required.

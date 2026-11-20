# First paid upgrade in PostHog

```text
TASK POSTHOG-FIRST-PAID-UPGRADE  priority: P2  status: DRAFT
goal: Join an opted-in grower's first confirmed recurring paid activation to their existing PostHog signup.
base: verdant-grow-diary @ c47a44d7d36b68d5cb6abd85e0975d41cdf9da85
branch: codex/posthog-first-paid-upgrade
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3042
owner: Codex, assigned the draft PR by Matthew on 2026-11-19
claimed_by: Codex, 2026-11-19 23:08 UTC
current_step: Implementation and local proof complete. The PR body records the exact reviewed candidate SHA and the current check state.
scope: SQL records the first verified live Pro or Craft subscription per account. The original operator cohort preserves its prior membership criteria. The owner-only browser lookup uses auth.uid(). Analytics settings and the consent banner describe the new opt-in.
measurement: The provider's first observed active period start and a stable event UUID survive retries. Old grants need reconfirmation on this device. Pre-grant upgrades and known returning subscribers are excluded. The browser must visit an eligible route after activation to deliver. A missing or ambiguous billing period yields no event.
evidence: 208 tests passed across 22 focused Vitest suites, including the normal consent and checkout hooks and the V0 loop contract. The SQL harness failed on the base with a missing RPC and passed on a disposable PostgreSQL engine with the new migration. The project type-check, changed-file ESLint and Prettier passed. Reproduction commands and any later CI or build results are in the PR.
reviewer_seat: UK Cheese coordinates one eligible, independent, complete-scope review for the full remote head. Codex authored this change and is excluded. Record the review receipt on the PR.
merge_owner: Matthew, Merge Steward. Paid-checkout and production gates remain in force. Keep draft until instructed.
next_action: Review billing eligibility and prior history, receipt grants, consent revocation, and delivery idempotency at the PR head. Confirm required CI and the independent verdict there before any gated release decision.
post_merge_check: Once Matthew approves and the migration and matching frontend are live, inspect the first naturally occurring consented upgrade in project 545866. Match its account ID to the existing signup in the 30-day journey and verify repeat visits count that grower once.
release_status: Production migration, deployment and live conversion NOT_MEASURED.
```

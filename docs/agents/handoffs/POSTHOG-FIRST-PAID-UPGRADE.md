# First paid upgrade in PostHog

```text
TASK POSTHOG-FIRST-PAID-UPGRADE  priority: P2  status: OPEN
goal: Join an opted-in grower's first confirmed recurring paid activation to their existing PostHog signup.
base: verdant-grow-diary @ ab8826ac72220b9da1fcf3ef57b0740812e9561f
branch: codex/posthog-first-paid-upgrade
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3042
owner: Codex, assigned the draft PR by Matthew on 2026-11-19
claimed_by: Codex, 2026-11-19 23:08 UTC
current_step: Open pull request, not a draft. Eligible navigation retries an empty or failed receipt lookup, and a later eligible route does not send the same receipt twice. Hosted required CI for this head is not measured here.
scope: SQL records the first verified live Pro or Craft subscription per account. The original operator cohort preserves its prior membership criteria. The owner-only browser lookup uses auth.uid(). Analytics settings and the consent banner describe the new opt-in.
measurement: The provider's first observed active period start and a stable event UUID survive retries. Old grants need reconfirmation on this device. Pre-grant upgrades and known returning subscribers are excluded. The browser must visit an eligible route after activation to deliver. A missing or ambiguous billing period yields no event.
evidence: Parent 997f991de8b1aaf8d7401341073d1f7c31f20908. Merge-base ab8826ac72220b9da1fcf3ef57b0740812e9561f. Commands on this commit: bunx vitest run src/test/first-paid-analytics-flow.test.tsx src/test/first-paid-posthog.test.ts src/test/test-execution-manifest.test.ts --reporter=dot (3 files, 52 passed); NODE_OPTIONS=--max-old-space-size=8192 bunx tsc --noEmit (exit 0); bunx eslint on the five changed source files (exit 0); bun run test:localstorage-helper-enforcement (assert OK, audit 4 passed); node scripts/scorer-lock.mjs --report --strict with no unlock file (exit 2, locked src/test/test-execution-manifest.test.ts). Hosted CI not run.
reviewer_seat: UK Cheese coordinates one eligible, independent, complete-scope review for the full remote head. Codex authored this change and is excluded. Record the review receipt on the PR.
merge_owner: Matthew, Merge Steward. Paid-checkout and production gates remain in force. The pull request is not a draft and is not queued.
next_action: Review billing eligibility and prior history, receipt grants, consent revocation, and delivery idempotency at the PR head. Confirm required CI and the independent verdict there before any gated release decision.
post_merge_check: Once Matthew approves and the migration and matching frontend are live, inspect the first naturally occurring consented upgrade in project 545866. Match its account ID to the existing signup in the 30-day journey and verify repeat visits count that grower once.
release_status: Production migration, deployment and live conversion NOT_MEASURED.
```

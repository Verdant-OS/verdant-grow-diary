# First paid upgrade in PostHog

```text
TASK POSTHOG-FIRST-PAID-UPGRADE  priority: P2  status: OPEN
goal: Join an opted-in grower's first confirmed recurring paid activation to their existing PostHog signup.
base: verdant-grow-diary @ ab8826ac72220b9da1fcf3ef57b0740812e9561f
branch: codex/posthog-first-paid-upgrade
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3042
owner: Codex, assigned the draft PR by Matthew on 2026-11-19
claimed_by: Codex, 2026-11-19 23:08 UTC
current_step: Open pull request, not a draft. Seat C P2-3 (eligible navigation must retry an empty receipt lookup) is in the working tree. Hosted required CI for the next head is not measured here.
scope: SQL records the first verified live Pro or Craft subscription per account. The original operator cohort preserves its prior membership criteria. The owner-only browser lookup uses auth.uid(). Analytics settings and the consent banner describe the new opt-in.
measurement: The provider's first observed active period start and a stable event UUID survive retries. Old grants need reconfirmation on this device. Pre-grant upgrades and known returning subscribers are excluded. The browser must visit an eligible route after activation to deliver. A missing or ambiguous billing period yields no event.
evidence: Prior-head suite counts are withdrawn. Current local checks are named on the pull request for the head that contains them. Hosted required CI is not measured in this file.
reviewer_seat: UK Cheese coordinates one eligible, independent, complete-scope review for the full remote head. Codex authored this change and is excluded. Record the review receipt on the PR.
merge_owner: Matthew, Merge Steward. Paid-checkout and production gates remain in force. The pull request is not a draft and is not queued.
next_action: Review billing eligibility and prior history, receipt grants, consent revocation, and delivery idempotency at the PR head. Confirm required CI and the independent verdict there before any gated release decision.
post_merge_check: Once Matthew approves and the migration and matching frontend are live, inspect the first naturally occurring consented upgrade in project 545866. Match its account ID to the existing signup in the 30-day journey and verify repeat visits count that grower once.
release_status: Production migration, deployment and live conversion NOT_MEASURED.
```

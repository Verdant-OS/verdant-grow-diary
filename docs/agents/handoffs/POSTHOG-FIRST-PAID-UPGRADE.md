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
scope: SQL records the first verified live Pro or Craft subscription per account. first_paid_seen_non_trial remembers a prior live paid status so a later trial replay cannot create a receipt. The original operator cohort preserves its prior membership criteria. The owner-only browser lookup uses auth.uid(). Analytics settings and the consent banner describe the new opt-in.
measurement: The provider's first observed active period start and a stable event UUID survive retries. The capture includes a safe browser $raw_user_agent so PostHog does not class the event as Automation. Old grants need reconfirmation on this device. Pre-grant upgrades and known returning subscribers are excluded. The browser must visit an eligible route after activation to deliver. A missing or ambiguous billing period yields no event.
evidence: Parent 341e6f72ac92b812a6f8a1e0efa3bd83f5c31d88. Merge-base ab8826ac72220b9da1fcf3ef57b0740812e9561f. Commands on this commit: sudo -u postgres psql -d first_paid_contract -v ON_ERROR_STOP=1 -f supabase/tests/posthog_first_paid_activation.sql (exit 0 on a minimal schema plus this migration). Scratch copies of the function then exit 3 when the seen-insert price list drops to craft_annual, when the prior-history price list drops to craft_monthly, and when the lower continuity bound widens from 5 minutes to 10 minutes. Those copies were not committed. Hosted CI not run.
reviewer_seat: Merge needs clean Seat A, Seat D, and Seat C passes at the exact head, Cheek's own-words yes at that SHA, and 39 required checks passing plus 1 skip. Codex authored this change and is excluded.
merge_owner: Matthew, Merge Steward. Paid-checkout and production gates remain in force. The pull request is not a draft and is not queued.
next_action: Review billing eligibility and prior history, receipt grants, consent revocation, and delivery idempotency at the PR head. Confirm required CI and the independent verdict there before any gated release decision.
post_merge_check: Once Matthew approves and the migration and matching frontend are live, inspect the first naturally occurring consented upgrade in project 545866. Match its account ID to the existing signup in the 30-day journey and verify repeat visits count that grower once.
release_status: Production migration, deployment and live conversion NOT_MEASURED.
```

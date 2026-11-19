# POSTHOG-FIRST-PAID-UPGRADE

```text
TASK POSTHOG-FIRST-PAID-UPGRADE  priority: P2  status: OPEN
goal: Record subscription_activated for an identified grower's first confirmed live paid-tier activation with analytics consent.
base: verdant-grow-diary @ c47a44d7d36b68d5cb6abd85e0975d41cdf9da85
branch: codex/posthog-first-paid-upgrade
owner: Codex, assigned the draft PR by Matthew on 2026-11-19
active_writer: Codex in the session preparing this draft
claimed_by: Codex, 2026-11-19 23:08 UTC
current_step: Initial implementation checkpoint.
evidence: The current PostHog product bridge omits billing events. The generic checkout-success event can also occur on an existing paid account. The database has a first-paid ledger, unique per user.
scope: A consent-bound, first-paid signal for PostHog. Use the authenticated grower's identity and the server's first-paid evidence. Test eligibility, deduplication and consent. Keep this task on its own branch.
holds: Paid-checkout release, production database changes, live charges and publication remain with Matthew. PR #2915 is a separate writer and excludes billing telemetry.
next_action: Land red regression coverage and the implementation on this draft. Record exact-head evidence and review status in the PR.
reviewer_seat: Coordinator routes independent review. Author and repairers are excluded.
post_merge_check: Once the approved version and any required database change are live, verify one naturally occurring, consented first-paid activation joined to the same signup. Do not induce a customer charge or synthesize a production conversion.
release_status: NOT_MEASURED. Draft work only.
```

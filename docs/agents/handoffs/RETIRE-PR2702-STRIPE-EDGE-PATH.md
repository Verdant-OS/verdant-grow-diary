### RETIRE-PR2702-STRIPE-EDGE-PATH

```text
TASK RETIRE-PR2702-STRIPE-EDGE-PATH  priority: P2  status: OPEN
goal: remove the PR #2702 / issue #2669 Stripe test-mode Edge Function lane (create-checkout-session, stripe-webhook, its rules, mirror copies, tests, pgTAP workflow, docs and config entries) in one PR; the never-applied migration file 20261101180000 stays in history unchanged (AGENTS.md section 5)
why: Matthew decided 2026-11-03 that Lovable's payments integration owns Stripe (route /api/public/payments/webhook, public.subscriptions.billing_provider); he answered "Yes" on 2026-11-03 ~13:16 CT to removing #2702 as a second Stripe writer for the same table. Migration 20261101180000 was never applied (source claim: its header and CURRENT_STATE) and its CHECK constraint conflicts with the live Lovable row shape.
branch: claude/retire-pr2702-stripe-edge-path
base: verdant-grow-diary
checkout: git fetch origin claude/retire-pr2702-stripe-edge-path verdant-grow-diary && git switch claude/retire-pr2702-stripe-edge-path && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2811 (ready for review, not draft)
head_sha: the commit carrying this block; removal commit f93b4c5247792eeb5cc7549a4ea82d90c82f4f65 (base ac10d68e); last reviewed head ac837e1913a26c584f038c02a07858ae3ec29795
state: ready for review; dequeued 2026-11-03 23:04 UTC (MERGE_CONFLICT on HANDOFF_LOG.md), base re-merged; Seat A review 5760749999 P2-1..P2-4 addressed in the follow-up commit
current_step: fresh-session review 5760578571 PASS and Seat A review 5760749999 PASS-with-P2 0/4/1, both at ac837e19; this head restores the two locked guards Seat A flagged and fixes this block; Matthew's yes at ac837e19 is void because the head moved
next_action: read the 35 required checks at the new head; route a re-review at the new full SHA to an eligible seat that is neither session_017UoYKxCwUMi8bpS1ph7KLn nor session_017UoYKvcvohNxhmW342Lieo; then Matthew's new per-item yes at that SHA before any queueing
post_merge_check: on the merged deploy tip, `git ls-tree -r --name-only origin/verdant-grow-diary | grep -cE "create-checkout-session/|stripe-webhook/|stripeWebhook|stripeCheckoutSession|stripeTestModeCatalog"` returns 0, and `node scripts/sync-edge-shared.mjs --check` passes
active_writer: Claude session_017UoYKvcvohNxhmW342Lieo (took over from session_017UoYKxCwUMi8bpS1ph7KLn, which stops pushing)
decisions: migration 20261101180000 file and its scripts/required-money-migrations.mjs filename-firewall entry are KEPT byte-identical: AGENTS.md section 5 makes merged migrations permanent and forbids deleting or no-oping them; it stays unapplied and must never be applied (its CHECK conflicts with the live Lovable row shape). Remove the rest whole, not partially: no other source file imports these modules (git grep on ac10d68e); Lovable restore at lovable-sync-1793724974 f0680d3d imports none of them. Keep src/test/core-link-form-census-rules.test.ts unchanged: it classifies the edge-function NAME create-checkout-session as mutating, which stays true and is not part of #2702.
tried_and_rejected: none
commands: node scripts/sync-edge-shared.mjs --check; NODE_OPTIONS=--max-old-space-size=4096 bun run typecheck; bunx vitest run <tests referencing stripe|supabase/migrations|supabase/functions|.github/workflows|.env.example>
files_touched: 27 files deleted (including the supabase/functions/_shared/lib/constants/pricing.ts mirror); 2 tests re-added under new names (src/test/retired-stripe-migration-firewall.test.ts, src/test/founder-entitlement-preserved.test.ts); .env.example; supabase/config.toml; supabase/functions/_shared/lib/.sync-manifest.json; migration 20261101180000 kept byte-identical
files_remaining: none known
blockers: money gate: Matthew's yes at the exact head SHA before queueing
open_questions: whether to add an operator note that 20261101180000 must never be applied (CURRENT_STATE row, owner's call)
gotchas: local results: typecheck exit 0; mirror check OK 107 files; 400 related test files -> 392 passed, 2 skipped, 6 failed (local-Postgres *-db suites, same failure on base ac10d68e: "BLOCKED: run as a non-root Unix user with PostgreSQL server tools")
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/new/claude/retire-pr2702-stripe-edge-path
artifacts: none beyond the branch
reviewer_seat: fresh Claude review session session_017UoYKv4arxJYBMGNNh1bvN (review 5760578571 PASS) and Seat A (review 5760749999 PASS-with-P2), both at ac837e19; re-review owed at the new head
reviewer_sha: ac837e1913a26c584f038c02a07858ae3ec29795 (superseded by this head)
session_state: Claude session_017UoYKvcvohNxhmW342Lieo holds the branch; previous holder session_017UoYKxCwUMi8bpS1ph7KLn; both are contributors and ineligible for independent acceptance; no paused workflows
claimed_by: Claude session_017UoYKvcvohNxhmW342Lieo, 2026-11-03 (takeover)
owner: Claude session_017UoYKvcvohNxhmW342Lieo
last_updated: 2026-11-03, by Claude session_017UoYKvcvohNxhmW342Lieo (takeover + base merge)
```

# STRIPE-LIVE-CHECKOUT-PLAN

```text
TASK STRIPE-LIVE-CHECKOUT-PLAN  priority: P2  status: OPEN
goal: Give Cheek a read-only plan for the smallest safe path to live Stripe subscription checkout, with his steps, costs, risks and decisions.
why: Cheek asked on 2026-11-12 14:39 UTC whether Stripe is the checkout, whether the payment key is the wrong type, and the easiest way to live checkouts. Building waits on his yes.
branch: claude/project-thread-q2b20e
base: verdant-grow-diary at c2884348875b3dd39f2059ecc323ac10c33cfde5
pr: draft, opened by this task (see the PR for its number and head)
head_sha: see the PR; this block is written before the first push
state: Plan written at docs/specs/stripe-live-checkout-plan.md. Docs only. No code, schema, RLS, Edge, secret, Lovable or production change.
current_step: Waiting on Cheek's decisions in section 9 of the plan.
next_action: On Cheek's yes, open Slice A (entitlement reader sees Stripe rows) as its own PR with one owner and an independent exact-head reviewer. First run the read-only production checks in section 6.
post_merge_check: NOT_APPLICABLE for a docs-only plan.
active_writer: Claude thread session for this task.
decisions: Recommend the repo server-side path (hosted Stripe Checkout started by a JWT-verified Edge function; a signed webhook as the only writer of Stripe rows; readable plan keys kept as price_id so KNOWN_PRICE_TO_PLAN stays the one grant table). No new table expected.
tried_and_rejected: Payment Links alone (the user id would come from a client-built URL, against AGENTS.md section 5).
commands: git grep -il stripe origin/verdant-grow-diary -- 'supabase/functions/*' 'src/*.ts' 'src/*.tsx'
files_touched: docs/specs/stripe-live-checkout-plan.md; docs/agents/handoffs/STRIPE-LIVE-CHECKOUT-PLAN.md
files_remaining: none for this plan.
blockers: Cheek's decisions; production schema and deployed-function list are NOT_MEASURED.
open_questions: Live subscriptions primary key; whether Lovable deployed Stripe Edge functions outside the repo.
gotchas: Migration 20261101180000 must never be applied. The shared entitlement reader is imported by metered AI functions, so Slice A redeploys them.
links: docs/specs/stripe-live-checkout-plan.md
reviewer_seat: Any available eligible independent session under OWNERSHIP.md section 4.3; excludes this author.
reviewer_sha: NOT_MEASURED
session_state: No routines, watchers or paused workflows started by this task.
claimed_by: Claude thread session, 2026-11-12
owner: Claude (plan author)
last_updated: 2026-11-12, by Claude thread session
```

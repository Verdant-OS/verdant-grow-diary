# STRIPE-RECEIPTS-PRIVILEGES

```text
TASK STRIPE-RECEIPTS-PRIVILEGES  priority: P2  status: OPEN
goal: remove client privileges on public.stripe_payment_receipts. PUBLIC and anon get none, authenticated keeps SELECT (owner-read policy stripe_receipts_owner_read), service_role keeps all.
why: #2873 (merged 2026-11-04 23:29:59 UTC as 7e4d79df) recorded the table as production carries it. Production shows anon and authenticated with all table privileges (source claim: #2873's catalog read, ~18:40 UTC), including TRUNCATE, which RLS does not cover. Reviewer D raised it as P3-2 on #2873. Owner decision, Matthew, 2026-11-04, own words in session_017UoYKyYn6zdpJ8hDJwznA7: "yes, tighten it, as its own small PR after #2873 lands. Leaving TRUNCATE open on a money table helps no one, and any Stripe code ported later should never depend on client writes to it."
branch: claude/gracious-meitner-m22v39
base: verdant-grow-diary at f95bfeb84e3854f4877601350d40435fb9d197da
checkout: git fetch origin claude/gracious-meitner-m22v39 verdant-grow-diary && git switch claude/gracious-meitner-m22v39 && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2876 (draft)
head_sha: read the PR head; a commit cannot name its own SHA
state: pushed draft; firewall entry added (scorer-lock unlock declared with Matthew's authorization, 2026-11-04 ~23:54 UTC)
current_step: all five files in place; waiting on CI at the new head and an independent exact-head review
next_action: read the 35 required checks by name at the PR head; route an independent exact-head review to an eligible non-author Main Reviewer seat (this session excluded); then Matthew's per-item yes naming #2876 and that exact SHA. Production apply is a separate founder decision.
post_merge_check: on the merged tip, node scripts/assert-no-unreviewed-money-migrations.mjs passes. After Matthew's production apply (his decision, not part of this PR): psql against production with -f supabase/tests/stripe_payment_receipts_privileges.sql prints "privilege contract: PASS".
active_writer: Claude session_017UoYKyYn6zdpJ8hDJwznA7
decisions: (1) separate PR, not folded into #2873, whose contract was "record what exists, change nothing". (2) Not catalog-guarded: this file is meant to change production when applied, and it should fail loudly if the table is missing. REVOKE/GRANT are idempotent. (3) Mirrors the ai_credit_grants pattern (20260721182752: REVOKE ALL FROM anon, authenticated; GRANT SELECT TO authenticated; GRANT ALL TO service_role). (4) stripe_record_credit_payment is SECURITY DEFINER owned by postgres, so its writes are unaffected. (5) KNOWN, not REQUIRED: absence leaves privileges loose but regresses no money behaviour, and the applied probe reads schema_migrations, which raw-SQL applies do not write.
tried_and_rejected: renaming the file to avoid the "billing" money pattern (that would dodge the firewall on a money table); editing the locked file without the declared unlock (the hook forbids it); adding a new CI pgTAP lane (touches .github, a protected scope, too big for this slice)
commands: bunx vitest run src/test/stripe-payment-receipts-billing-privileges-migration.test.ts src/test/record-live-stripe-billing-schema-migration.test.ts src/test/retired-stripe-migration-firewall.test.ts --reporter=dot; node scripts/assert-no-unreviewed-money-migrations.mjs; node scripts/check-supabase-migration-safety.mjs
files_touched: scripts/required-money-migrations.mjs, supabase/migrations/20261104233500_stripe_payment_receipts_billing_privileges.sql, supabase/tests/stripe_payment_receipts_privileges.sql, src/test/stripe-payment-receipts-billing-privileges-migration.test.ts, docs/agents/handoffs/STRIPE-RECEIPTS-PRIVILEGES.md
files_remaining: none
blockers: migration and money gates (Matthew's per-item yes at the exact head); independent review by a non-author seat. verdant-ultra-bot's APPROVE (review 5777677005, at 443e478a, no text) is not that review: roster line 36 says Ultra seats never approve.
open_questions: none on scope; whether Matthew wants the production apply right after merge
gotchas: the vitest firewall case fails, and assert-no-unreviewed-money-migrations fails, until the KNOWN entry lands; both are the same missing line. Local evidence is PG 16; production is 17.6.
artifacts: local PG 16.15 fixture with Supabase default privileges plus base fixture plus merged 20261104184500. Before: relacl {postgres=arwdDxt,anon=arwdDxt,authenticated=arwdDxt,service_role=arwdDxt}; contract fails "anon must not hold SELECT". After: {postgres=arwdDxt,service_role=arwdDxt,authenticated=r}; contract PASS; second apply identical; no relation lock taken; stripe_record_credit_payment called as service_role writes 1 receipt and 150 credits. Working-tree checks: vitest 9 passed / 1 failed (the KNOWN entry), check-supabase-migration-safety OK.
reviewer_seat: eligible independent session under OWNERSHIP.md section 4.3; session_017UoYKyYn6zdpJ8hDJwznA7 excluded (author)
reviewer_sha: none yet
session_state: no paused workflows; pending human decisions listed under blockers
claimed_by: Claude session_017UoYKyYn6zdpJ8hDJwznA7, 2026-11-04 23:45 UTC
owner: Claude session_017UoYKyYn6zdpJ8hDJwznA7
last_updated: 2026-11-04 23:56 UTC, by Claude session_017UoYKyYn6zdpJ8hDJwznA7 (firewall entry added)
```

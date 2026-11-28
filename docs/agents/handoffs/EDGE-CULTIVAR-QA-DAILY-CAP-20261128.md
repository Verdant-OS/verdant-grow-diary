# EDGE-CULTIVAR-QA-DAILY-CAP-20261128

```text
TASK EDGE-CULTIVAR-QA-DAILY-CAP-20261128  priority: P2  status: OPEN
goal: Each paid grower gets at most 30 Cultivar Q&A model calls per UTC day. The ai-cultivar-qa Edge function counts the call through a service-role-only RPC before it calls the AI gateway, and refuses the call when the count cannot be taken.
why: Finding E1 of the 2026-11-19 read-only security review: the paid Cultivar Q&A sits outside the grow credit ledger, so one account could loop the shared AI gateway balance that AI Doctor and Coach also use. Matthew said "Build both" on 2026-11-28 06:18 UTC and "Push both, 30 is fine" at 06:27 UTC.
branch: claude/cultivar-qa-daily-cap
base: verdant-grow-diary at a47ca7ed20d72023b5cb45d6d2a5eb86b7908604
pr: draft, number recorded on the pull request
state: built and tested locally; pushed as a draft PR.
decisions: (1) A new counter table plus a SECURITY DEFINER RPC instead of the grow credit ledger: Cultivar Q&A is not grow-scoped and AGENTS.md section 7 keeps the credit ledger for AI Doctor and Coach. (2) The count is one INSERT ... ON CONFLICT DO UPDATE ... WHERE call_count < limit, so two concurrent calls cannot both take the last slot. (3) The day is the UTC calendar day, matching the monthly credit window's UTC rule. (4) The count runs after the paid gate and request validation, so a free user or a malformed question never consumes a slot, and before the gateway fetch. (5) Fails closed: an RPC error, a missing function or a malformed answer returns usage_unavailable (503) and no model call. (6) Limit 30 per person per day, confirmed by Matthew. (7) A provider failure after the count still uses the slot; no refund path, kept deliberately simple.
behavior_change: Cultivar Q&A answers daily_limit_reached (200) after 30 counted calls in a UTC day; the panel says "You've reached today's limit for cultivar questions. It resets at midnight UTC." No other function, no billing, no credits changed.
files_touched: supabase/migrations/20261128070000_ai_cultivar_qa_daily_usage.sql (new); supabase/functions/_shared/cultivarQaDailyCap.ts (new); supabase/functions/ai-cultivar-qa/index.ts; config/edge-function-domain-reach.json; src/components/CultivarQaPanel.tsx; src/test/ai-cultivar-qa-daily-cap.test.ts (new); supabase/tests/ai_cultivar_qa_daily_usage.sql (new); .github/workflows/cultivar-qa-daily-cap-pgtap.yml (new); this handoff.
tests: pgTAP supabase/tests/ai_cultivar_qa_daily_usage.sql on a throwaway local PostgreSQL 16 with pgTAP: 17 of 17 pass. Negative runs: without the WHERE guard, 2 fail (11, 15); with authenticated dropped from the REVOKEs, 4 fail (2, 3, 5, 17). src/test/ai-cultivar-qa-daily-cap.test.ts under bun test (vitest import swapped to bun:test, supplemental): 20 pass; with the index.ts and panel changes set aside, 3 fail. Existing ai-cultivar-qa-edge-hardening.test.ts: 3 pass. Gates: check-edge-function-domain-reach shows only the pre-existing stripe-webhook failure that the base also has; check-supabase-migration-safety OK; assert-no-unreviewed-money-migrations OK; verify-published-migration-integrity OK; verify-edge-shared-in-sync OK; check-no-src-lib-imports OK; check-contract-test-resolution OK; prettier OK.
blockers: local vitest, eslint and a clean tsc are BLOCKED: node_modules lacks pathe and node and react types, and bun install --frozen-lockfile gets 403. CI is the gate.
post_merge_check: ORDER MATTERS. Apply migration 20261128070000_ai_cultivar_qa_daily_usage.sql to production BEFORE deploying ai-cultivar-qa. If the function deploys first, every Cultivar Q&A question answers usage_unavailable until the migration lands. After both: one paid question answers normally and adds one row for that user and today's UTC date.
reviewer_seat: migration plus Edge function change, gated: Reviewer A or C per OWNERSHIP.md section 4.3, excluding this author session and Matthew.
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: merge yes at an exact head; migration apply and function deploy, in that order, are Matthew's.
claimed_by: Claude thread session for the security review task, 2026-11-28 06:40 UTC
owner: Claude thread session for the security review task
last_updated: 2026-11-28 06:55 UTC
```

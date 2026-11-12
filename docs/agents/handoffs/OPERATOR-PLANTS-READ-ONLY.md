# OPERATOR-PLANTS-READ-ONLY

```text
TASK OPERATOR-PLANTS-READ-ONLY  priority: P2  status: OPEN
goal: An account holding the operator role can read growers' plants but can no longer UPDATE them. Growers' own plant edits are unchanged.
why: Row-level security pass 2026-11-12 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8. Migration 20260517010926 created "Operators update all plants" (FOR UPDATE, USING and WITH CHECK on has_role(auth.uid(), 'operator') only): any operator could change every column of every grower's plant row. It is the only operator write policy on a core grow table, and no application surface used it (the only caller was the example helper moderatePlantAsOperator in src/lib/permissions.ts, referenced only by its own two unit tests). Matthew chose "Operator plants read-only" on the decision card.
branch: claude/operator-plants-read-only
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/operator-plants-read-only verdant-grow-diary && git switch claude/operator-plants-read-only
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2941 (ready for review since 2026-11-12 01:36 UTC)
head_sha: code at b300c9c8171a66029e3f2523f458db3ba46b993d (2026-11-12); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: implemented, marked ready by owner decision; required CI and Codex review running
current_step: ready for review; Codex P2 on the newest-migration assertion fixed in the follow-up commit
next_action: one independent exact-head review once required checks are green. This is a migration PR: it stays out of the merge queue until a human approves the exact head SHA, and applying it to production is the founder's own step.
post_merge_check: after the operator applies the migration in production, in the SQL editor: select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'plants' order by 1; expect no row named "Operators update all plants", and "Operators view all plants" plus "Users update own plants" still present. Before that apply, production behavior is NOT_MEASURED and unchanged.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
decisions: (1) One new additive migration, 20261112030000_operator_plants_read_only.sql: DROP POLICY IF EXISTS plus a postflight DO block that raises if the policy is still present. No published migration is edited. (2) moderatePlantAsOperator and its two unit tests are removed, because after the policy is gone the helper would report success while updating zero rows. (3) The operator SELECT policy on plants is kept.
behavior_change: after the migration is applied, an operator UPDATE on another grower's plant matches zero rows. No shipped screen performs that update, so no grower- or operator-visible flow changes.
scorer_lock: one tracked scorer modified, declared before the edit: src/lib/permissions.test.ts (removed the cases "moderatePlantAsOperator blocks non-operator" and "moderatePlantAsOperator runs for operator", and the import). No other check was weakened.
runtime_evidence: local only, PostgreSQL 16.15, disposable cluster on a unix socket, minimal baseline (plants, user_roles, has_role, auth.uid, the two owner policies) with the two operator policies loaded verbatim from lines 53-64 of 20260517010926. BASELINE operator UPDATE of grower A's plant rows=1. AFTER applying the migration rows=0; operator SELECT rows=2; grower A UPDATE own rows=1; grower A UPDATE grower B rows=0. Re-apply succeeded as a no-op. The rollback statement in the migration comment restored rows=1. This is not a full migration replay and not production; production runs PostgreSQL 17 (NOT_MEASURED here). The postflight RAISE branch was not exercised (a dropped policy cannot survive in the same transaction).
tried_and_rejected: keeping the helper with a comment (it would silently no-op); a Docker-based Supabase replay (no Docker daemon in the authoring container).
commands: bunx vitest run src/test/operator-plants-read-only.test.ts src/lib/permissions.test.ts --reporter=dot ; node scripts/check-supabase-migration-safety.mjs ; node scripts/verify-published-migration-integrity.mjs ; node scripts/scorer-lock.mjs --report --strict
files_touched: supabase/migrations/20261112030000_operator_plants_read_only.sql (new); src/lib/permissions.ts; src/lib/permissions.test.ts; src/test/operator-plants-read-only.test.ts (new); this file
files_remaining: none for this slice
blockers: none
open_questions: (1) supabase/tests/pheno_candidate_number_maintenance_paths.sql lines 154-160 carry a comment that names "Operators update all plants" as a way a non-owner reaches a plant row. The test logic does not depend on the policy (it runs under role none) and was not edited; the comment becomes stale once this is applied. (2) Correction to the same row-level security pass: it also reported that a grower can set profiles.current_badge to any text. That is true of committed migrations only (last guard definition 20260721194325 does not list current_badge). docs/knk-20260824-profiles-gamification-triggers-apply-ledger-operator-runbook.md records that production knkwiiywfkbqznbxwqfh was captured on 2026-08-24 with an UPDATE trigger that refuses current_badge changes and an INSERT trigger that nulls it (source claim; live state NOT_MEASURED since). That ledger closes #1120 and bars #1178 as the wrong artifact, so no migration was written. Owner decision 2026-11-12: drop the badge-lock slice. src/test/profiles-gamification-write-protection.test.ts and its integration twin still pin a client badge edit as succeeding, which matches committed history and not the recorded live trigger; left unchanged.
gotchas: `bun run typecheck` (tsc) runs out of heap at Node's default in the authoring container; export NODE_OPTIONS=--max-old-space-size=8192 before committing until #2938 lands.
links: none besides the PR
artifacts: the test files above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: mark ready, review routing, exact-head approval for a migration PR, the per-item merge yes, and the production apply
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 01:00 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-11 20:10 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```

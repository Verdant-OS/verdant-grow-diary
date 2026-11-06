# GROWER-BUGS-20

```text
TASK GROWER-BUGS-20  priority: P1  status: CLOSED
closed: merged. #2857 merged into verdant-grow-diary on 2026-11-04 as 7042edefdc9d84fe37cd0a873d5ca8ba03871fe5 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: grower bug brief 2026-11-03 item 20 - test/QA tents and grows live in a real account; stop test tooling from writing to real accounts; list, do not delete
why: e2e/lib/productionQuickLogFixtureRules.ts pinned the production Quick Log write smoke to cheekhimself@gmail.com (#2478, 2026-10-24), contradicting docs/production-only-verification-runbook.md:8 (#1971, 2026-10-27: disposable test account only, never the owner's accounts). The four named tents are created by no repo spec or script (hand-driven QA/audit sessions)
branch: claude/grower-bugs-20 (founder-named, 2026-11-04)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2857
head_sha: read the current head on GitHub
state: ready for review (marked ready 2026-11-04 by Matthew's instruction); base merged
current_step: both production-writing jobs in quicklog-smoke.yml sign in as disposable accounts, never personal ones. The write smoke uses secrets.E2E_SMOKE_* gated on vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT. The authenticated One-Tent proof (Reviewer B P2) uses a second, empty disposable account, secrets.E2E_ONETENT_* gated on vars.E2E_ONETENT_EXPECTED_ACCOUNT_HINT, and refuses the smoke account, because a Free account holds one active grow (Codex P2 at 439562c0; Matthew chose a second disposable account 2026-11-04). secrets.E2E_TEST_* is used only by the read-only proof workflows
next_action: independent exact-head review; Matthew's own-words yes for the scorer-locked test changes at the final SHA; after merge Matthew creates two disposable accounts and sets secrets.E2E_SMOKE_EMAIL/PASSWORD + vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT (Quick Log fixture account with its E2E Test grow/tent/plant) and secrets.E2E_ONETENT_EMAIL/PASSWORD + vars.E2E_ONETENT_EXPECTED_ACCOUNT_HINT (empty account)
post_merge_check: quicklog-smoke workflow_dispatch with the disposable account passes "Verify disposable E2E fixture"; with the owner's account it refuses (personal_account_refused)
active_writer: Claude session claude/grower-bugs-20
decisions: founder chose re-point to a disposable account (2026-11-04); scorer unlocks recorded for 8 files (7 changed); no workflow change (quicklog-smoke.yml and pheno-journey-smoke.yml already pass the var); nothing deleted
tried_and_rejected: none
commands: bunx vitest run src/test/production-write-smoke-disposable-account.test.ts src/test/production-quicklog-fixture.test.ts src/test/quicklog-e2e-fixture-safety.test.ts --reporter=dot
files_touched: e2e/lib/productionQuickLogFixtureRules.ts, e2e/lib/productionQuickLogFixtureProof.ts, e2e/scripts/print-fixture-config-checklist.ts, e2e/README.md, e2e/FIXTURE_SETUP.md, src/test/production-quicklog-fixture.test.ts, src/test/quicklog-e2e-fixture-safety.test.ts, src/test/production-write-smoke-disposable-account.test.ts, docs/test-data-in-real-accounts.md, docs/agents/handoffs/GROWER-BUGS-20.md
files_remaining: none for this slice
blockers: disposable account not yet created (owner action)
open_questions: whether the read-only proofs (signed-in, Actions, Settings) should also move to the disposable account
gotchas: the listing SQL pattern can match real names (e.g. "QA Pheno"); review before any cleanup
links: none
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3
reviewer_sha: none yet
session_state: Claude session also watches PRs #2820, #2828, #2842, #2844, #2846, #2851
claimed_by: Claude, 2026-11-04 04:30 UTC
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 19:40 UTC, by Claude session_017UoYKyhNGum4qmfYdoNRLr)
```

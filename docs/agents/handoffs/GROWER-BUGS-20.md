# GROWER-BUGS-20

```text
TASK GROWER-BUGS-20  priority: P1  status: OPEN
goal: grower bug brief 2026-11-03 item 20 - test/QA tents and grows live in a real account; stop test tooling from writing to real accounts; list, do not delete
why: e2e/lib/productionQuickLogFixtureRules.ts pinned the production Quick Log write smoke to cheekhimself@gmail.com (#2478, 2026-10-24), contradicting docs/production-only-verification-runbook.md:8 (#1971, 2026-10-27: disposable test account only, never the owner's accounts). The four named tents are created by no repo spec or script (hand-driven QA/audit sessions)
branch: claude/grower-bugs-20 (founder-named, 2026-11-04)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2857
head_sha: read the current head on GitHub
state: ready for review (marked ready 2026-11-04 by Matthew's instruction); base merged
current_step: both jobs in quicklog-smoke.yml now sign in only as the disposable account: the write smoke (Codex P2s) and the authenticated One-Tent proof, which writes a marker-tagged grow/tent/plant on production (Reviewer B P2, Matthew chose to move it 2026-11-04). Both gate on vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT and refuse personal accounts; secrets.E2E_TEST_* is used only by the read-only proof workflows
next_action: independent exact-head review; Matthew's own-words yes for the 4 scorer-locked test changes at the final SHA; after merge Matthew creates the disposable account and sets secrets.E2E_SMOKE_EMAIL, secrets.E2E_SMOKE_PASSWORD and vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT
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
last_updated: 2026-11-04 19:40 UTC, by Claude session_017UoYKyhNGum4qmfYdoNRLr
```

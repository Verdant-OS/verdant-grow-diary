# PHENO-SCORING-TEMPLATES-SLICE1

```text
TASK PHENO-SCORING-TEMPLATES-SLICE1  priority: P3  status: CLOSED
closed: merged. #3004 merged into verdant-grow-diary through the merge queue on 2026-11-19 04:20:54 UTC as 30cd21e2f033deb759bb92ad5331181fd2bf8778 (final SHA; GitHub API, read 2026-11-19 04:21 UTC) from final head da6b93793a9bb6d8a44fb047366a0cc218189336. Queued and merged by the cheekhimself account. Closed the same day by Claude session_017UoYKydSdb658VBhhuatv9.
review_gap: #3004 merged WITHOUT the independent exact-head review this file routed to Reviewer E (AGENTS.md sections 11 and 13). Reviews on record at merge: a Codex bot COMMENT on superseded head c1b6d495, a cheekhimself COMMENT on superseded head 3c3d4fa, and a matt816cheek-bit APPROVE at da6b937. None is a Reviewer E verdict at da6b937. Owed: a post-merge independent review at da6b93793a9bb6d8a44fb047366a0cc218189336 by Reviewer E or another eligible non-contributing reviewer (exclude session_017UoYKydSdb658VBhhuatv9). Any P1 or P2 it finds reopens this work with the same owner.
deploy_state: not deployed or published by this task. A merge is not a deployment; live /version.json was not checked.
goal: A typed, deterministic scoring-template engine for pheno hunts, plus two original Verdant starter templates (pheno scorecard, tasting scorecard), so later slices can render and save scorecards without guessing the data shape.
why: Matthew asked (2026-11-18, via coordinator relay) for slice 1 of the pheno rubric template spec as a draft PR: templates and scoring rules only. He then asked for Verdant's own starter rubrics built from common cultivation criteria, so no outside permission is needed.
branch: claude/project-thread-n7led3
base: verdant-grow-diary at 5719269b
pr: #3004
state: merged (see closed). Earlier history: marked ready on Matthew's word 2026-11-18; second commit fixed a Codex bot P2 (malformed section became a validation issue instead of a crash).
next_action: (1) the owed post-merge independent review at da6b937 (see review_gap); (2) the post_merge_check below, owned by this task's owner: confirm the pheno-scoring-template-rules test file stays green on the deploy branch and record the result here. Starter field review, scale default, Winner/Overall mapping and persistence stay open decisions for Matthew in later slices.
post_merge_check: none user-visible. No route, component or write path uses these modules yet. Post-merge check is that the pheno-scoring-template-rules test file stays green on the deploy branch. Result so far: PASS for the merge commit only. The CI workflow push run 44457695858 on verdant-grow-diary at 30cd21e2f033deb759bb92ad5331181fd2bf8778 concluded success, with all 32 Full test suite shards and Lint, typecheck, test, build green (GitHub API, read 2026-11-19 04:50 UTC). Later deploy-branch heads are NOT_MEASURED. The same commit's Dependency & Security CI push run 44457695567 failed in check:deps on the picomatch reviewed-exception mismatch, which this slice did not touch.
decisions: (1) The rating scale is a template parameter {min,max,step,labels}, with optional per-field override; nothing hard-codes 0-10 or 1-5. Starter pheno scorecard uses 1-5 step 1; starter tasting scorecard uses 0-10 step 0.5. (2) Null or absent means not scored, never 0. (3) No total, average, composite, rank or keeper output; the engine reports per-field validity, counts, required-missing and completeness only. (4) Winner and Overall mapping are left out of slice 1. (5) Starter templates are draft and internal-only.
open_decisions_for_matthew: the 0-10 versus 1-5 default; which starter fields to keep, rename or drop; Winner/Overall mapping; whether to persist responses in a new table (later slice).
behavior_change: none at runtime. New pure modules and constants only; nothing imports them yet.
not_in_scope: schema, RLS, migrations, edge functions, auth, UI, persistence, AI, Action Queue, ranking, Winner/Overall mapping, the existing contenders board.
tests: new src/test/pheno-scoring-template-rules.test.ts (32 tests). Local under bun's runner (supplemental; CI vitest is the gate): 32 pass, 0 fail, 80 expects. Codex P2 regression tests ("rejects a section that is not an object or has no fields array", "never accepts a template that evaluation cannot walk"): RED before the fix, 2 fail / 30 pass (TypeError reading section.fields on null); GREEN after. RED with both modules set aside: suite fails to load (cannot find module). Mutations: null-coerced-to-0 gives 3 failures; off_step check removed gives 1; requiredMissing push removed gives 1. Existing guards phenoid-ranking-read-fence (3/0) and pheno-copy-regression (8/0) pass.
commands: bunx vitest run src/test/pheno-scoring-template-rules.test.ts --reporter=dot ; bun run typecheck ; bun run lint
red_proof_recipe: git diff origin/verdant-grow-diary -- src/lib/phenoScoringTemplateRules.ts src/constants/phenoScoringTemplates.ts > x.patch && git apply -R x.patch ; run the test file, expect it to fail to load ; git apply x.patch
files_touched: src/lib/phenoScoringTemplateRules.ts (new; section_invalid issue added); src/constants/phenoScoringTemplates.ts (new); src/test/pheno-scoring-template-rules.test.ts (new); this file (new)
files_remaining: none for this slice
blockers: local vitest, tsc and eslint through the repo toolchain are BLOCKED. bun install --frozen-lockfile got ProxyConnectFailed (403) on tarballs pinned to the Lovable registry mirror in bun.lock. No npm fallback was used in the repo. Prettier 3.7.3 and strict tsc on the two modules ran from a scratch directory outside the repo and passed. CI is the evidence for this head.
gotchas: pheno-copy-regression.test.ts scans pheno files for ranking and winner wording; the new files avoid it. The test file's own banned-phrase list is a guard, not copy.
reviewer_seat: Reviewer E (VReviewer), routed by PR comment [ROUTE]; one request per full head SHA, refreshed for the new head
reviewer_sha: none yet (earlier head c1b6d495 superseded before any verdict)
session_state: no routines, no paused workflows. Pending human decisions: starter field review, scale default, Winner/Overall mapping, persistence. The merge yes is no longer pending: #3004 merged (see closed).
claimed_by: Claude session_017UoYKydSdb658VBhhuatv9, 2026-11-18 04:09 UTC
owner: Claude session_017UoYKydSdb658VBhhuatv9
last_updated: 2026-11-19 04:52 UTC, by Claude session_017UoYKydSdb658VBhhuatv9
```

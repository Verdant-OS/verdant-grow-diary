# PHENO-SCORING-TEMPLATES-SLICE1

```text
TASK PHENO-SCORING-TEMPLATES-SLICE1  priority: P3  status: OPEN
goal: A typed, deterministic scoring-template engine for pheno hunts, plus two original Verdant starter templates (pheno scorecard, tasting scorecard), so later slices can render and save scorecards without guessing the data shape.
why: Matthew asked (2026-11-18, via coordinator relay) for slice 1 of the pheno rubric template spec as a draft PR: templates and scoring rules only. He then asked for Verdant's own starter rubrics built from common cultivation criteria, so no outside permission is needed.
branch: claude/project-thread-n7led3
base: verdant-grow-diary at 5719269b
pr: opened after first push; number recorded on the PR and in the next update of this file
state: pushed; draft PR; required checks running; no independent review yet
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this (exclude session_017UoYKydSdb658VBhhuatv9); (3) Matthew reviews the starter template fields; (4) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: none user-visible. No route, component or write path uses these modules yet. Post-merge check is that the pheno-scoring-template-rules test file stays green on the deploy branch.
decisions: (1) The rating scale is a template parameter {min,max,step,labels}, with optional per-field override; nothing hard-codes 0-10 or 1-5. Starter pheno scorecard uses 1-5 step 1; starter tasting scorecard uses 0-10 step 0.5. (2) Null or absent means not scored, never 0. (3) No total, average, composite, rank or keeper output; the engine reports per-field validity, counts, required-missing and completeness only. (4) Winner and Overall mapping are left out of slice 1. (5) Starter templates are draft and internal-only.
open_decisions_for_matthew: the 0-10 versus 1-5 default; which starter fields to keep, rename or drop; Winner/Overall mapping; whether to persist responses in a new table (later slice).
behavior_change: none at runtime. New pure modules and constants only; nothing imports them yet.
not_in_scope: schema, RLS, migrations, edge functions, auth, UI, persistence, AI, Action Queue, ranking, Winner/Overall mapping, the existing contenders board.
tests: new src/test/pheno-scoring-template-rules.test.ts (30 tests). Local under bun's runner (supplemental; CI vitest is the gate): 30 pass, 0 fail. RED with both modules set aside: suite fails to load (cannot find module). Mutations: null-coerced-to-0 gives 3 failures; off_step check removed gives 1; requiredMissing push removed gives 1. Existing guards phenoid-ranking-read-fence (3/0) and pheno-copy-regression (8/0) pass.
commands: bunx vitest run src/test/pheno-scoring-template-rules.test.ts --reporter=dot ; bun run typecheck ; bun run lint
red_proof_recipe: git diff origin/verdant-grow-diary -- src/lib/phenoScoringTemplateRules.ts src/constants/phenoScoringTemplates.ts > x.patch && git apply -R x.patch ; run the test file, expect it to fail to load ; git apply x.patch
files_touched: src/lib/phenoScoringTemplateRules.ts (new); src/constants/phenoScoringTemplates.ts (new); src/test/pheno-scoring-template-rules.test.ts (new); this file (new)
files_remaining: none for this slice
blockers: local vitest, tsc and eslint through the repo toolchain are BLOCKED. bun install --frozen-lockfile got ProxyConnectFailed (403) on tarballs pinned to the Lovable registry mirror in bun.lock. No npm fallback was used in the repo. Prettier 3.7.3 and strict tsc on the two modules ran from a scratch directory outside the repo and passed. CI is the evidence for this head.
gotchas: pheno-copy-regression.test.ts scans pheno files for ranking and winner wording; the new files avoid it. The test file's own banned-phrase list is a guard, not copy.
reviewer_seat: requested on the PR once the head is pushed; one request per full head SHA
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: starter field review, scale default, merge yes.
claimed_by: Claude session_017UoYKydSdb658VBhhuatv9, 2026-11-18 04:09 UTC
owner: Claude session_017UoYKydSdb658VBhhuatv9
last_updated: 2026-11-18 04:09 UTC, by Claude session_017UoYKydSdb658VBhhuatv9
```

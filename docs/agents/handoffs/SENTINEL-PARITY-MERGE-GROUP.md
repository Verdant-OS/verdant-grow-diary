# SENTINEL-PARITY-MERGE-GROUP

```text
TASK SENTINEL-PARITY-MERGE-GROUP  priority: P1  status: CLOSED
closed: merged. #2958 merged into verdant-grow-diary on 2026-11-12 at 12:22 UTC as 75e2a70d0de7b55c439855615a05d9716b08028b (final SHA; first-parent commit on origin/verdant-grow-diary whose subject ends (#2958), read 2026-11-12; merge time from GitHub). Closed in bulk by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f on 2026-11-12 at Matthew's request (source claim: his message relayed in that thread's brief). This close does not resolve the post-merge check, open questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261112.md.
goal: let merge-queue entries land again by making "Governance files agree on Sentinel-Version" report on the queue's own test merge.
why: The copilot-advisory-review ruleset (id 26731444, created 2026-11-06 22:25 UTC, last updated 2026-11-11 19:48 UTC) requires six contexts on refs/heads/verdant-grow-diary. Four of them never run on merge_group events: "Governance files agree on Sentinel-Version", "CodeQL", "Analyze (actions)", "Analyze (python)". The queue waits for them until check_response_timeout_minutes (360) and drops the entry. The deploy branch has stayed at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 (2026-11-06 22:23 UTC) since. Measured 2026-11-12 08:51 UTC on #2938's queue group head 9e2d6309017b2395fa58ce53163e90c4b5613830: all 79 check runs complete and green, all 35 contexts of ruleset 24445196 present, the four contexts above absent. Matthew chose this fix on 2026-11-12 ("Workflow PR"), with CodeQL handled by him.
branch: claude/sentinel-parity-merge-group
base: verdant-grow-diary; created at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8, forward-merged with 42f867b510ece2edf365c469be5cc920cb4e98a3 on 2026-11-12
checkout: git fetch origin claude/sentinel-parity-merge-group verdant-grow-diary && git switch claude/sentinel-parity-merge-group
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2958
head_sha: read the current head from the PR
state: pushed, CI green at fa934b1e as a draft; marked ready for review 2026-11-12 after Matthew chose to keep it
current_step: independent exact-head review routed
next_action: wait for the independent exact-head verdict at the current head; the merge itself needs Matthew's own-words yes at that head
post_merge_check: the next merge_group run on verdant-grow-diary reports "Governance files agree on Sentinel-Version" (success). A queue entry still landing NOT_MEASURED until CodeQL and both Analyze contexts also report on merge_group, which is Matthew's settings change. A failure reopens this work with the same owner.
active_writer: Claude session_017UoYKve9UakRXv4mFpE95p
decisions: (1) Add merge_group (types: checks_requested) to .github/workflows/sentinel-version-parity.yml. merge_group takes no paths filter, so the job runs on every entry; it has no install step and runs in seconds. (2) Pass github.event.merge_group.base_sha as SENTINEL_BASE_SHA so BUMP compares the queue test merge with the tip it was built on, instead of falling back to a merge-base guess (github.event.before is empty on merge_group). (3) Leave the pull_request and push path filters unchanged: every open PR checked (#2938, #2940, #2941, #2947) adds a handoff under docs/agents/** and so already gets the context at PR level. (4) Leave CodeQL default setup and the ruleset to Matthew, per his choice. (5) New contract test reads the parsed workflow (AGENTS.md section 10).
scorer_lock: .github/workflows/sentinel-version-parity.yml is a tracked scorer. Unlock declared 2026-11-12 08:57 UTC with reason "merge queue stall: add merge_group trigger so the queue receives the 'Governance files agree on Sentinel-Version' context required by the copilot-advisory-review ruleset (Matthew chose the workflow PR fix, 2026-11-12). Adds runs; loosens nothing." The change adds runs; no gate, test or allowlist was loosened.
tried_and_rejected: removing the pull_request path filter as well; not needed for the queue and widens the slice.
not_changed: CodeQL default setup and the copilot-advisory-review ruleset (Matthew). config/required-status-checks.json still mirrors ruleset 20421416, while the live deploy-branch ruleset is 24445196 with the same 35 contexts, and the advisory ruleset is not mirrored anywhere; follow-up, not this slice. Open PRs #2933 and #2948 edit scripts/check-sentinel-version-parity.mjs; this slice does not touch the checker.
commands: bunx vitest run src/test/sentinel-version-parity-merge-group.test.ts --reporter=dot ; node --test scripts/check-sentinel-version-parity.test.mjs ; SENTINEL_BASE_SHA=c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 node scripts/check-sentinel-version-parity.mjs
files_touched: .github/workflows/sentinel-version-parity.yml; src/test/sentinel-version-parity-merge-group.test.ts (new); docs/agents/handoffs/SENTINEL-PARITY-MERGE-GROUP.md (new)
files_remaining: none for this slice
blockers: none. Update 2026-11-12: at 09:14:29 UTC the copilot-advisory-review ruleset was edited to require only "Claude locked paths" and "EcoWitt custom-upload claims pgTAP (disposable local Postgres)"; #2938 merged from the queue 24 s later (9e2d6309). This PR is no longer needed to unblock the queue; Matthew chose to keep it as merge_group coverage for the parity check.
open_questions: none
gotchas: the scorer unlock lived in the git-ignored .claude/scorer-unlock.json; --lock was run after the first commit. Because the parity context is no longer ruleset-required, a red parity run on a queue entry will not block the queue by itself.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2938
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: one safety-net check-in scheduled by this session; pending human decision: the per-item merge yes
claimed_by: Claude session_017UoYKve9UakRXv4mFpE95p, 2026-11-12 09:00 UTC
owner: Claude session_017UoYKve9UakRXv4mFpE95p
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f (bulk close; previous 2026-11-12 10:00 UTC, by Claude session_017UoYKve9UakRXv4mFpE95p)
```

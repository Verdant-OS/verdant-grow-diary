# LEGACY-QUICKLOG-RETIREMENT-SPEC

```text
TASK LEGACY-QUICKLOG-RETIREMENT-SPEC  priority: P3  status: OPEN
goal: Give the owner an evidence-based plan for retiring the legacy Quick Log dialog, so the build order is a decision and not a guess. Docs only.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 found two Quick Log implementations. Matthew asked for the retirement next and chose "Write the spec first" on the decision card (2026-11-12), after inspection showed the legacy dialog is still a live save surface with no retirement plan in the repo.
branch: claude/legacy-quicklog-retirement-spec
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/legacy-quicklog-retirement-spec verdant-grow-diary && git switch claude/legacy-quicklog-retirement-spec
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2950 (draft)
head_sha: spec at c16379e49b43209dc623d843ff6b5570a7f75dd2 (2026-11-12); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: spec written, pushed draft
current_step: draft PR open
next_action: owner answers the five decisions in section 8 of docs/specs/legacy-quick-log-retirement.md; no stage is approved for build until then
post_merge_check: none (docs only)
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
findings: (1) Legacy src/components/QuickLog.tsx is mounted in AppShell (every signed-in page), DailyCheck (/daily-check, the mobile "Log" tab) and GrowRoomMode (no route). (2) AppShell opens V2 for the header "+", the mobile FAB and the two V2 open events (8 modules), and opens legacy for PLANT_QUICKLOG_PREFILL_EVENT (29 modules) and the start-screen and guide intents. (3) Both save through useQuickLogV2Save -> quicklog_save_manual; legacy adds one grows.stage update after a confirmed save. (4) About a dozen capture types and handoffs exist only in legacy. (5) 74 test files reference legacy (44 import, 31 mock) and five Playwright specs use its test ids, including the golden path and the Quick Log smoke.
decisions: recommend a staged retirement by entry path (spec section 7), not a single deletion. No code was changed.
correction: an earlier chat message in this session said the legacy dialog had two hosts. That search missed AppShell's relative import; the spec states three hosts.
method_limit: the capability table (spec section 5) is an import and test-id comparison, labeled inference. It is not a side-by-side behavioral run. Usage of each entry path is missing evidence (not measured).
scorer_lock: no tracked scorer modified.
commands: bunx prettier --check docs/specs/legacy-quick-log-retirement.md
files_touched: docs/specs/legacy-quick-log-retirement.md (new); this file
files_remaining: none for this slice
blockers: none for the spec; the build stages are blocked on the owner's decisions
open_questions: the five decisions in spec section 8. Stage 1 would edit dispatch sites and may need QuickLogV2Sheet.tsx, which open PR #2936 also edits.
gotchas: count imports including relative ones (AppShell uses "./QuickLog"); an alias-only search under-counts hosts.
links: docs/specs/one-tent-loop-quicklog-single-write-path.md (the write path this plan keeps); #2936
artifacts: the spec
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: spec section 8, mark ready, review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 07:10 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-12 01:10 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```

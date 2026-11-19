# LEGACY-QUICKLOG-RETIREMENT-SPEC

```text
TASK LEGACY-QUICKLOG-RETIREMENT-SPEC  priority: P3  status: CLOSED
closed: merged. #2950 merged into verdant-grow-diary on 2026-11-12 at 10:47 UTC as 58286d66fb8ed7380977c25d5301ec7e4a882512 (final SHA; first-parent commit on origin/verdant-grow-diary whose subject ends (#2950), read 2026-11-12; merge time from GitHub). Closed in bulk by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f on 2026-11-12 at Matthew's request (source claim: his message relayed in that thread's brief). This close does not resolve the post-merge check, open questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261112.md.
goal: Give the owner an evidence-based plan for retiring the legacy Quick Log dialog, so the build order is a decision and not a guess. Docs only.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 found two Quick Log implementations. Matthew asked for the retirement next and chose "Write the spec first" on the decision card (2026-11-12), after inspection showed the legacy dialog is still a live save surface with no retirement plan in the repo.
branch: claude/legacy-quicklog-retirement-spec
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/legacy-quicklog-retirement-spec verdant-grow-diary && git switch claude/legacy-quicklog-retirement-spec
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2950 (ready for review since 2026-11-12 07:06 UTC)
head_sha: read the current head from the PR. History: spec first at c16379e49b43209dc623d843ff6b5570a7f75dd2; Codex corrections at f468b29adfce84661e4142d670493f02bfcff660; independent-review corrections in the commit after that.
state: spec written, marked ready by owner decision; two Codex P2 findings corrected in the follow-up commit
current_step: ready for review
next_action: fresh independent exact-head review of the corrected spec; then the owner answers the six decisions in section 8 of docs/specs/legacy-quick-log-retirement.md; no stage is approved for build until then
post_merge_check: none (docs only)
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
findings: (1) Legacy src/components/QuickLog.tsx is mounted in AppShell (every signed-in page), DailyCheck (/daily-check, the mobile "Log" tab) and GrowRoomMode (no route). (2) AppShell opens V2 for the header "+", the mobile FAB and the two V2 open events (8 modules), and opens legacy for the event string verdant:open-quicklog, which three constants and some bare-string call sites send (25 modules dispatch it by name, 7 more dispatch a rules-supplied event name; spec section 3.2 and appendix A), and for the start-screen and guide intents. (3) Both save through useQuickLogV2Save -> quicklog_save_manual; legacy adds one grows.stage update after a confirmed save. (4) About a dozen capture types and handoffs exist only in legacy. (5) 74 test files reference legacy (44 import, 31 mock) and six Playwright specs use a legacy-only test id, including the golden path and the Quick Log smoke. (6) A V2 open event today carries only a target and action water or feed, with no prefill and no note action, so producers cannot move by swapping the event (spec section 3.3); stage 1 now starts with extending that contract.
decisions: recommend a staged retirement by entry path (spec section 7), not a single deletion. No code was changed.
correction: an earlier chat message in this session said the legacy dialog had two hosts. That search missed AppShell's relative import; the spec states three hosts.
method_limit: the capability table (spec section 5) is an import and test-id comparison, labeled inference. It is not a side-by-side behavioral run. Usage of each entry path is missing evidence (not measured).
scorer_lock: no tracked scorer modified.
commands: bunx prettier --check docs/specs/legacy-quick-log-retirement.md
files_touched: docs/specs/legacy-quick-log-retirement.md (new); this file
files_remaining: none for this slice
blockers: none for the spec; the build stages are blocked on the owner's decisions
open_questions: the six decisions in spec section 8. Stage 1 would edit dispatch sites and may need QuickLogV2Sheet.tsx, which open PR #2936 also edits.
gotchas: count imports including relative ones (AppShell uses "./QuickLog"); an alias-only search under-counts hosts.
links: docs/specs/one-tent-loop-quicklog-single-write-path.md (the write path this plan keeps); #2936
artifacts: the spec
review_history: at f468b29adfce84661e4142d670493f02bfcff660 an independent review (session_017UoYKySX4uKEtc7z7uaMN5, pullrequestreview-5871233641) returned FAIL with two P2 (producer inventory by constant name missed aliased and bare-string dispatchers; stage 1 assumed a V2 intent contract that does not exist), and Seat A (pullrequestreview-5871156742) returned PASS-with-P2 on the spec count of Playwright specs and the QuickLogPrefill module count. All four, plus the P3 items (V2 Fab host, test-id method, stale handoff fields), are corrected in the commit after f468b29a. Both verdicts are historical once the head moves.
reviewer_seat: none current; a fresh exact-head review is needed at the new head
reviewer_sha: none current (last reviewed head f468b29adfce84661e4142d670493f02bfcff660, superseded)
session_state: no routines, no paused workflows; pending human decisions: spec section 8 (six items), review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 07:10 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f (bulk close; previous 2026-11-12 02:35 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8)
```

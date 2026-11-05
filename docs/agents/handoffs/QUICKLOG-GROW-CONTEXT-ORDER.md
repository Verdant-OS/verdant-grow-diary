TASK QUICKLOG-GROW-CONTEXT-ORDER priority: P1 status: CLOSED
goal: Global Quick Log opened from a grow-scoped page (for example /timeline?growId=<grow>) lists that grow's tents and plants first under "In this grow", with the rest under "Other grows". It never pre-selects a target.
why: Friction follow-up 2026-11-04, finding #1 (High), Quick Log half. From the Skunk Gas Run Timeline, global Quick Log opened with no target and every account tent/plant mixed together (QA, legacy and similarly named Flower/Flowering), a wrong-scope save risk. The Sensors half merged as cd6f8fab (#2895).
branch: claude/new-session-1xvdwv (shared with the SENSORS-GROW-SCOPE-INTENT closing commit; this session may push only to this branch)
base: verdant-grow-diary @ cd6f8fab13a950c73033b91cdb130a6ef9ee35c1
checkout: git fetch origin claude/new-session-1xvdwv verdant-grow-diary && git switch claude/new-session-1xvdwv
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2896 (merged)
head_sha: 8ca3bfecebcc02257dc8ccb12a8877abe237fcf6 (reviewed head); merged to verdant-grow-diary as def965e1c055cb0932f1134e7b5a01824c154e93 on 2026-11-05 ~18:31 UTC
state: merged; not live-verified
current_step: closed. 35/35 required checks green at 8ca3bfe; must-be-green `Timeline local-day date filter (mocked)` was cancelled once by a 15-minute timeout (Chromium install took 14 min; tests 3/3 PASS), re-run once and passed. Codex code and security reviews clean at 8ca3bfe. The PR was enqueued at 18:25 UTC by the shared cheekhimself identity, not by this session; the queue produced a merge commit (parents cd6f8fab, 8ca3bfe) whose tree equals the reviewed head.
next_action: none for this task. Run post_merge_check once Matthew publishes. Finding #2 (Dashboard Today's Grow Checks retry) is the next unclaimed slice.
post_merge_check: after it is live, open the fixture grow's Timeline (URL carries growId), open global Quick Log: target field shows the placeholder (nothing selected) and the list shows "In this grow" with only that grow's targets first
active_writer: Claude session_017UoYKwPKmXxd9hAw4QxsYU
decisions:

- Grow context orders the list only. Target selection stays explicit or route-derived (`quickLogTargetResolutionRules.ts` has no remembered-default tier; only-plant auto-selection stays banned). A grow is not a write target.
- Tent context still wins: when the sheet has a tent context, the existing "In this tent / Other" grouping is used and the grow grouping is skipped.
- A missing or malformed growId, or a grow with no listed targets, keeps the ungrouped list.
- The growId is read from the route search (`?growId=`, the key `withGrowId` writes) in AppShell and passed as a prop; QuickLogV2Sheet does not read the router itself.
  tried_and_rejected:
- Pre-selecting the grow's only tent: rejected, it would reintroduce silent default targeting.
  commands:
- bunx vitest run src/test/quick-log-grow-context-targets.test.ts src/test/quick-log-grow-context-sheet.test.tsx src/test/app-shell-mobile-quick-log-routing.test.tsx --reporter=dot
- NODE_OPTIONS=--max-old-space-size=6144 bun run typecheck
  files_touched: src/lib/quickLogV2Rules.ts, src/lib/quickLogRouteTargetRules.ts, src/components/QuickLogV2Sheet.tsx, src/components/AppShell.tsx, src/test/quick-log-grow-context-targets.test.ts, src/test/quick-log-grow-context-sheet.test.tsx, src/test/app-shell-mobile-quick-log-routing.test.tsx, docs/agents/handoffs/QUICKLOG-GROW-CONTEXT-ORDER.md
  files_remaining: none for this slice
  blockers: none for code. Live verification needs a publish (founder-only).
  open_questions:
- Should the "Other grows" group also hide QA/legacy tents? Not done here; GROWER-BUGS-20 (#2857) owns QA tents in real accounts.
  gotchas:
- typecheck needs NODE_OPTIONS=--max-old-space-size=6144 in this container (pre-commit hook too).
  links: source report — Matthew's friction follow-up, 2026-11-04 (private; not committed)
  artifacts: rules test RED 5/5 failed then 5/5 pass; negative gate on sheet+AppShell: 2 failed / 23 passed, restored 25/25; all Quick Log + AppShell test files 447/447 (5561 tests)
  reviewer_seat: Codex (chatgpt-codex-connector), not an author or repairer; [ROUTE] https://github.com/Verdant-OS/verdant-grow-diary/pull/2896#issuecomment-6664583495
  reviewer_sha: 8ca3bfecebcc02257dc8ccb12a8877abe237fcf6 (code review no findings; security review no unresolved findings)
  session_state: Claude cloud session session_017UoYKwPKmXxd9hAw4QxsYU; subscribed to #2896
  claimed_by: Claude session_017UoYKwPKmXxd9hAw4QxsYU, 2026-11-05
  owner: Claude
  last_updated: 2026-11-05 12:35 CT, by Claude (closed: merged as def965e1)

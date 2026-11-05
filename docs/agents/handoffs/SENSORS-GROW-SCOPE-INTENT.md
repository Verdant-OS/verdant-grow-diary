TASK SENSORS-GROW-SCOPE-INTENT priority: P1 status: CLOSED
goal: /sensors honours the `growId` that Timeline's "Review sensor snapshot" already carries, so Sensors and its AI Doctor link stay in the grow the grower came from.
why: Friction follow-up 2026-11-04, finding #1 (High). From the Skunk Gas Run Timeline, Sensors opened UX Audit Test Tent (another grow) and its next AI Doctor link targeted that test grow/tent — a wrong-scope risk for diary and AI context. Root cause (established fact): `readSensorsTentRouteIntent` read only `tentId`; with no tent in the URL the fallback picked the account's first tent, and the per-user page session kept a previous tent from any grow.
branch: claude/new-session-1xvdwv
base: verdant-grow-diary @ 343002a8500ad14a6acd1f88420d601894cc22b3
checkout: git fetch origin claude/new-session-1xvdwv verdant-grow-diary && git switch claude/new-session-1xvdwv
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2895 (merged)
head_sha: 901293392d5ee60fdbc24ad3109d1b0fa28a5d8e (reviewed head); merged to verdant-grow-diary as cd6f8fab13a950c73033b91cdb130a6ef9ee35c1 on 2026-11-05 14:42 UTC
state: merged; not live-verified
current_step: closed. Merged through the merge queue after 35/35 required checks, clean Codex code and security reviews at the head, and Matthew's per-item yes at that head. The queue produced a merge commit (parents 343002a8, 90129339) rather than a squash; its tree equals the reviewed head.
next_action: none for this task. Run post_merge_check once Matthew publishes. Remaining finding #1 work (global Quick Log scope from a grow-scoped Timeline) is a separate, unclaimed slice.
post_merge_check: after it is live, from the fixture grow's Timeline press "Review sensor snapshot" and confirm Sensors highlights a tent in that grow and its AI Doctor link carries the same growId; a different grow reopens this task with the same owner
active_writer: Claude session_017UoYKwPKmXxd9hAw4QxsYU
decisions:

- A carried growId limits only route-applied choices (requested, remembered, first-available) to that grow. A grower's explicit chip click may still leave the grow; required-intent explicit picks drop the grow filter. Reason: the grower decides; the route only stops silent cross-grow fallback.
- A grow with no tents selects nothing (chips stay, none highlighted) rather than borrowing another grow's tent. Reason: zero/missing is not a reason to pick unrelated data.
- growId is optional on the intent object and only present when valid, so existing `toEqual` pins on the intent shape stay unchanged.
  tried_and_rejected:
- Filtering only the first-available fallback: rejected because the persisted page session keeps a previous cross-grow tent as `currentTentId`.
  commands:
- bunx vitest run src/test/sensors-grow-scope-intent.test.ts src/test/sensor-route-tent-intent-rules.test.ts src/test/sensors-page-session-rules.test.ts src/test/sensors-tent-selection-wiring.test.ts src/test/grow-scoped-cta-growid.test.ts --reporter=dot
- NODE_OPTIONS=--max-old-space-size=6144 bun run typecheck
  files_touched: src/lib/sensorRouteTentIntentRules.ts, src/lib/sensorsPageSessionRules.ts, src/pages/Sensors.tsx, src/test/sensors-grow-scope-intent.test.ts, docs/agents/handoffs/SENSORS-GROW-SCOPE-INTENT.md
  files_remaining: none for this slice
  blockers: none for code. Live verification BLOCKED until a reviewed merge is published (founder-only).
  open_questions:
- Global Quick Log from a grow-scoped Timeline still opens with no target and all account tents (same finding #1). Separate slice; target selection must stay explicit or route-derived (no remembered/only-plant auto-select).
  gotchas:
- `bun run typecheck` OOMs at the default Node heap in this container; set NODE_OPTIONS=--max-old-space-size=6144.
- node_modules was absent; `bun install --frozen-lockfile` succeeded here.
  links: source report — Matthew's friction follow-up, 2026-11-04 (uploaded to session, private screenshots not committed)
  artifacts: RED 7 failed / 1 passed before the fix; 8/8 after. Review-fix round: RED 2 failed / 8 passed, then 10/10; 31 Sensors test files 315/315
  reviewer_seat: Codex (chatgpt-codex-connector), not an author or repairer; [ROUTE] https://github.com/Verdant-OS/verdant-grow-diary/pull/2895#issuecomment-6660343511
  reviewer_sha: 901293392d5ee60fdbc24ad3109d1b0fa28a5d8e (code review "no major issues"; security review "no security issues")
  session_state: Claude cloud session session_017UoYKwPKmXxd9hAw4QxsYU; no routines; no paused workflows
  claimed_by: Claude session_017UoYKwPKmXxd9hAw4QxsYU, 2026-11-05
  owner: Claude
  last_updated: 2026-11-05 08:45 CT, by Claude (closed: merged as cd6f8fab)

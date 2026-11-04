# PLANT-HASH-SCROLL-OFFSET

```text
TASK PLANT-HASH-SCROLL-OFFSET  priority: other  status: CLOSED
goal: Give every plant-detail hash target the same sticky-header scroll offset (scroll-mt-16) before PR #2285 switches landings to scrollIntoView block start.
why: Independent review of #2285 found #plant-harvest-evidence has no scroll-mt-16, and could not locate the plant-recent-activity target.
branch: cursor/plant-hash-scroll-offset-509a
base: verdant-grow-diary at a18cb8479
checkout: git fetch origin cursor/plant-hash-scroll-offset-509a verdant-grow-diary && git switch cursor/plant-hash-scroll-offset-509a && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2544 (open, not draft; do not change draft or ready state)
head_sha: reviewed parent 692573d19075cd731e66771414236d8032b4bea4. This repair commit cannot embed its own SHA. After the normal push, origin/cursor/plant-hash-scroll-offset-509a is the head.
state: CLOSED. Merged as c7288b50c3f255f4275e6eab8522c7aaa576c583 (#2544) on 2026-10-27T18:56:11Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: HANDOFF_LOG outside this block matches base a18cb847 byte for byte. Product offset change is unchanged. PR is open and not draft. No queue, merge, or deploy.
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: bunx vitest run src/test/plant-detail-hash-scroll-offset.test.tsx — a failure reopens this slice with the same owner. NOT_MEASURED until merged.
active_writer: Cursor Grok cloud agent (this session)
decisions: plant-recent-activity renders on the Card in PlantRecentActivityPanel. Its offset is scroll-mt-16, matching the other mapped targets. The harvest-evidence disclosure trigger gets scroll-mt-16 only when it owns an anchor id. PLANT_DETAIL_KNOWN_ANCHOR_IDS drives the rendered-page regression. P3 1px header-border note left unchanged.
tried_and_rejected: Rewriting neighboring fences was rejected; the merge had turned base fences into 4-backtick lines. This repair restores the base file and inserts only this block.
commands: bunx vitest run src/test/plant-detail-hash-scroll-offset.test.tsx src/test/plant-detail-disclosure-section.test.tsx src/test/plant-detail-disclosure-rules.test.ts --reporter=dot
files_touched: src/components/PlantDetailDisclosureSection.tsx; src/components/PlantRecentActivityPanel.tsx; src/lib/plantDetailDisclosureRules.ts; src/test/plant-detail-hash-scroll-offset.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: Do not edit claude/plant-hash-scroll-align-top. scroll-mt-16 is a 4rem offset; replacing scroll-mt-20 on the recent-activity card changes that margin by 1rem under center alignment. A reviewer noted scroll-mt-16 can leave 1px under the header border; that P3 was left as-is.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2544 ; https://github.com/Verdant-OS/verdant-grow-diary/pull/2544#pullrequestreview-5669691817 ; https://github.com/Verdant-OS/verdant-grow-diary/pull/2285
artifacts: src/test/plant-detail-hash-scroll-offset.test.tsx
reviewer_seat: Sour Diesel review 5669691817 recorded the P2s this commit repairs. This session authored the change and does not request a new review here.
reviewer_sha: 692573d19075cd731e66771414236d8032b4bea4
session_state: Cursor cloud agent; PR is open and not draft; no merge, queue, or deploy
claimed_by: Cursor Grok cloud agent, 2026-10-26
owner: Cursor Grok cloud agent
last_updated: 2026-10-27 10:26 CT, by Cursor Grok cloud agent
```

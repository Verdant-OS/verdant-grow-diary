# GROWER-BUGS-16

```text
TASK GROWER-BUGS-16  priority: P2  status: CLOSED
closed: merged. #2842 merged into verdant-grow-diary on 2026-11-04 as b21aaaf628b0826f3a9f9b17680fcc7b1e3de5cf (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: grower bug brief 2026-11-03 item 16 - visible Timeline grow switcher (done here) and a spec for an "All grows" Timeline view
why: the only switcher was a tiny breadcrumb select that never rendered on plain /timeline; growers could not tell which grow they were reading or switch easily
branch: claude/grower-bugs-16 (founder-named, 2026-11-03)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2842
head_sha: read the current head on GitHub
state: ready for review; required checks green at the last measured head
current_step: switcher shipped (src/lib/timelineGrowSwitcherRules.ts, src/components/TimelineGrowSwitcher.tsx, Timeline header actions); "All grows" spec at docs/specs/timeline-all-grows-view.md (recommends item 10 pagination first)
next_action: independent review of this PR; founder decides whether item 10 (pagination/perf) precedes All grows, as the spec recommends
post_merge_check: on verdantgrowdiary.com, an account with two grows sees a labelled Grow picker on /timeline; switching changes the grow and drops plant/entry filters
active_writer: Claude session claude/grower-bugs-16
decisions: switch writes only ?growId= (URL already wins over the stored active grow); plant/tent/entry filters dropped on switch, date/source kept; no All-grows code until item 10 lands (row volume on an unstable page)
tried_and_rejected: none
commands: bunx vitest run src/test/timeline-grow-switcher.test.tsx src/test/timeline-grow-switcher-rules.test.ts --reporter=dot
files_touched: src/lib/timelineGrowSwitcherRules.ts, src/components/TimelineGrowSwitcher.tsx, src/pages/Timeline.tsx, src/test/timeline-grow-switcher.test.tsx, src/test/timeline-grow-switcher-rules.test.ts, docs/specs/timeline-all-grows-view.md, docs/agents/handoffs/GROWER-BUGS-16.md
files_remaining: none for this slice
blockers: none
open_questions: item 10 before All grows?
gotchas: PR #2820 (claude/new-session-azpsz3) also edits src/pages/Timeline.tsx (Recent Quick Logs targetNames); expect a small merge when one lands
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2820
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3
reviewer_sha: none yet
session_state: Claude session also watches PR #2820 and #2828
claimed_by: Claude, 2026-11-03 21:10 CT
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 11:25 UTC, by Claude (moved to per-task file per docs/agents/handoffs/README.md))
```

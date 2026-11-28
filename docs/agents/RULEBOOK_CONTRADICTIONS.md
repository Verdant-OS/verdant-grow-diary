# Rulebook contradictions left open by #2933

#2933 said it does not touch "the three rulebook contradictions" and did not
list them in the merged pull-request body. The three named here are the three
sources the "Start here (agents)" section of `docs/agents/CURRENT_STATE.md`
says disagree, and which #2933 did not edit. This file lists them. It does not
pick a reading.

1. **Role file vs the file that loads it.** On 2026-11-04, `docs/agents/roles/claude.md` opened with "Historical — no current seat", while `CLAUDE.md` loads that file as the role for a Claude session. **Blocks:** deciding whether a Claude session may implement, or may only specify. A later edit (AGENTS.md §17, 2026-11-17.1) changed the role file's opening lines. That edit is not a decision on items 2 and 3.

2. **Roster, 2026-10-31.** `docs/agents/constitution/roster.md` says only the Merge Steward queues and merges, and only after a non-author reviewer approves that exact head. **Blocks:** any other seat marking a pull request ready or putting it in the merge queue.

3. **Bounded-merge grant, 2026-10-20.** The "Start here (agents)" section records that Claude may mark a pull request ready and enqueue it when the four conditions in that grant all hold at one SHA. **Blocks:** waiting for the Merge Steward when those conditions hold, and enqueueing when the roster says only the Steward may enqueue.

`CURRENT_STATE.md` says Matthew's 2026-11-04 decision governs where these three disagree until a roster pull request reconciles them. This list does not reconcile them.

# Start here

One page for any agent that opens this repo. Shared rules stay in `AGENTS.md`.
This page does not repeat them. The routing and smoke paragraphs stay in
`docs/agents/SENTINEL_BLOCK.md`.

## 1. What to read

Read these, in order, then stop. Do not read `docs/agents/CURRENT_STATE.md` or
`docs/agents/handoffs/` whole.

1. This page.
2. `docs/agents/SENTINEL_BLOCK.md`.
3. `AGENTS.md` (the only copy of the shared rules).
4. Your role file under `docs/agents/roles/`. It points here. It is not a second start page.
5. The "Start here (agents)" section of `docs/agents/CURRENT_STATE.md` (everything above `# Verdant — Current Operating State`). Search the rest of that file only when that section says to.
6. `docs/agents/HANDOFF_LOG.md`, then handoff files whose TASK line reads `status: OPEN`.

Return the `SENTINEL_ACK` block from `AGENTS.md` §14 before any other work.

## 2. How to find free work

Look in this order:

1. Milestone **M1 Diary truth**, then **M2 EcoWitt light ingest**, then **M3 Proven paid Stripe**. **M4 CI and security floor** runs beside them and does not gate them.
2. Work `docs/agents/constitution/handoff-procedure.md` says is eligible: no effective claim, or the last activity is older than 24 hours, and no assignment or lock conflicts. `handoff:needed` can still be eligible. `blocked` is not free.

## 3. How to claim it

Follow `docs/agents/constitution/handoff-procedure.md`. Post `claimed_by: <agent>, <YYYY-MM-DD HH:MM> UTC` on the pull request, then re-read the comments. If an earlier valid claim exists, stop. A name in the handoff file is not a claim by itself. After the claim holds, set `status:in-progress` and clear every other status label. Exactly one status label is set at a time. `blocked` counts as a status label.

## 4. How to hand it off

The last thing you do before you stop, including when you are running out of tokens, is the stop-anywhere note below. Put it in the task handoff file and on the pull request. Then set `handoff:needed` if nobody is taking the branch, or `status:needs-review` if the work is pushed and waiting on an independent reviewer.

```text
task: <id and one line>
branch: <name>
head: <full 40-character SHA>
done: <what landed>
verified: <command and result, or not run and why>
not_done: <what remains>
next: <one concrete step>
holds: <who must act, or none>
```

That note is at most 15 lines. A cold agent should be able to run `next` from the note, the pull request, and the repo.

## 5. What never to do

- Do not publish, apply production SQL, spend money, or change auth, RLS, schema, or edge functions unless the founder names that action.
- Do not merge, arm auto-merge, or push the deploy branch directly.
- Do not review your own work. Seats and the merge queue are in `AGENTS.md` and `docs/agents/OWNERSHIP.md`.
- Do not weaken a check, a test, or a lock to make CI pass.
- Do not delete history. Archive it.
- Do not pick a winner when two rulebooks disagree. Report the conflict. The open conflicts are listed in `docs/agents/RULEBOOK_CONTRADICTIONS.md`.

## Status labels

Set exactly one of these:

| Label | When |
| --- | --- |
| `status:ready` | Free to claim. No writer is on it. |
| `status:in-progress` | A writer has claimed it and is working. |
| `status:needs-review` | The work is pushed and is waiting on independent review. |
| `handoff:needed` | The writer is stopping. The stop-anywhere note is written. |
| `blocked` | The work cannot move until the named hold is cleared. |

## Milestones

Find work in this priority order:

1. M1 Diary truth
2. M2 EcoWitt light ingest
3. M3 Proven paid Stripe
4. M4 CI and security floor (alongside M1–M3; it does not block them)

---
name: verdant-auto-handoff
description: Keeps a long Verdant Claude Code session resumable. A PostToolUse hook (context-mark.mjs, wired in .claude/settings.json) reads the session's context size from its transcript and injects one reminder when it passes about 150k tokens and one after a compaction. Load this skill when either reminder arrives, or before stopping any session with unpushed work. At the mark, finish the step in hand, refresh the task's docs/agents/handoffs/<TASK-ID>.md entry, push your own branch and leave `resume here` with the full head SHA on the pull request. After a compaction, re-read that entry and the newest `resume here`, and confirm the head against GitHub before your next change. It is not a review and grants no new authority.
---

# verdant-auto-handoff — push a resumable handoff before the context runs out

A compaction summary is lossy, and a session that runs out of budget with nothing pushed cannot
be resumed by anyone (`AGENTS.md` §12, `docs/agents/constitution/handoff-procedure.md`). The hook
makes the moment visible. This skill says what to do with it.

## 1. What the hook does

`context-mark.mjs` runs after every tool call. It reads the last main-thread assistant message in
the session transcript, adds its three input-token fields, and compares the total with the last
value it saw for this session (kept in `.claude/data/verdant-auto-handoff/<session>.json`, which
git ignores).

- **Mark:** the total crosses 150,000 tokens from below. It fires once per crossing.
- **Compaction:** the total falls from at or above 150,000 to under half of the previous value.
  It fires once, and the mark re-arms.

It never blocks. Every path exits 0, and it prints nothing unless one of the two fires.

## 2. At the mark

1. Finish the step in hand. Start no new deliverable.
2. Update the task's own entry, `docs/agents/handoffs/<TASK-ID>.md`, with the cold-start facts the
   handoff procedure names: goal, state, current step, next action, decisions and why, what was
   tried and rejected, exact commands, files touched and still to touch, blockers, open
   questions, gotchas, head SHA, reviewer and the SHA that review covers.
3. Commit only verified work and push the branch you hold. Never push a branch another holder
   owns, the deploy branch or `main`, and never force-push.
4. Leave `resume here` on the pull request with the full 40-character head SHA and the next action.

If the session has no task entry yet, write one before the first push. Never edit blocks in
`docs/agents/HANDOFF_LOG.md`.

## 3. After a compaction

Before your next change:

1. Re-read the task's `docs/agents/handoffs/<TASK-ID>.md` entry and the newest `resume here` on
   the pull request.
2. Confirm the branch head against GitHub: `git fetch origin <branch>` and compare
   `git rev-parse HEAD` with `git rev-parse origin/<branch>`.
3. Treat anything the summary says that the entry, the pull request or the repository does not
   show as unverified. Re-measure it before you rely on it.

## 4. What stays out of the entry

No password, token, API key, sign-in code or link, card or account number, and no customer
record. Every session in the project can read the entry.

## 5. What it is not

It is not a review, an approval or a release step. It changes nothing about who may push, review,
merge or publish. The independent exact-head review, the required checks and the founder's
per-item yes still apply.

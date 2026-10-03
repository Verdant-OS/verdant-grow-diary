---
name: verdant-collision-guard
description: Read-only pre-edit check for Verdant-OS/verdant-grow-diary. Verifies the deploy-branch state, the exact files a proposed edit would touch, every existing open or recently merged change to those files, and who owns that work, then stops with a verdict and does not edit. Use before writing code, docs or config, before committing or pushing, when asked to "run collision guard" or "check for collisions", and whenever another agent, session or PR may already be working in the same area.
---

# verdant-collision-guard — check before you touch

`AGENTS.md` (Multi-Agent Coordination) says: check recent merged PRs and open PRs before
substantial work, never build a second implementation, and report a collision instead of
resolving it. This skill turns that rule into a fixed, read-only procedure with one output.

Operating facts that change — open PRs, claims, holds, locks, who owns which slice — live in
`docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md` and `docs/agents/OWNERSHIP.md`.
This file carries the procedure only. Read those files at run time; never answer from memory.

## 1. Contract

- **Read-only.** Allowed: `git fetch`, `git log`, `git show`, `git ls-tree`, `git merge-tree`,
  `git status`, read-only `gh api` GETs, reading files, listing sessions. Not allowed: editing,
  staging, committing, pushing, commenting, labelling, claiming, closing, re-running checks,
  or messaging another session to change its work.
- **Stops after the verdict.** The guard never proceeds to the edit, even when the verdict is
  `CLEAR`. The user (or the task's explicit instruction) starts the edit afterwards.
- **Needs a concrete edit.** If no proposed edit is named, ask for it. Do not guess one from
  conversation history.
- **Fresh every time.** A result is valid for the deploy-branch SHA and PR snapshot it records.
  Any push, merge or new PR after that makes it stale; re-run before acting.

## 2. Inputs

1. The proposed edit, in one sentence.
2. Any files, PRs or branches the user already named.
3. The branch this session is assigned to push to, if any.

## 3. Procedure

Run every step. A step that cannot be measured is `BLOCKED` or `NOT_MEASURED`, never skipped
silently and never a pass.

### S1. Current state

1. `git fetch origin verdant-grow-diary` and record the full tip SHA. The deploy branch is
   `verdant-grow-diary`, not `main`; never audit `main`.
2. `git status --short` and the current branch. Uncommitted or unpushed local work is part of
   the picture; report it, do not discard it.
3. If a session branch is assigned: does it exist on the remote, does it carry commits not in
   the deploy tip, and does it already have an open, merged or closed PR? A merged PR means
   follow-up work restarts from the deploy tip on a new PR.
4. Read `docs/agents/CURRENT_STATE.md` for active holds, locks, publish stops and fences that
   name the area.

### S2. Exact files

Resolve the edit to a concrete path list against the deploy tip (`git ls-tree -r --name-only
origin/verdant-grow-diary`). Mark each path `EXISTS` or `NEW`. Name the symbol or line anchor
when the edit is narrower than a file. Then flag every path that falls in a protected class:

| Class                                                                                                                                                                                                   | Why it matters                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/**` already on the deploy branch                                                                                                                                                   | Immutable. Never edit; ship a new additive migration (`AGENTS.md`, Migration rules).                                   |
| `supabase/**`, auth, RLS, Edge Functions, billing, entitlements                                                                                                                                         | Out of scope unless explicitly assigned; production-DB changes are the owner's.                                        |
| `bun.lock`, `package-lock.json`, `package.json` dependencies                                                                                                                                            | Lockfile policy; bun only.                                                                                             |
| Generated: `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts`, `supabase/functions/_shared/lib`                                                            | Never hand-edit.                                                                                                       |
| The twelve versioned governance files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.grok/rules/verdant-grok-role.md`, `docs/agents/README.md`, `docs/agents/HANDOFF_PROTOCOL.md`, `docs/agents/roles/*.md`) | One edit bumps all twelve `Sentinel-Version`s.                                                                         |
| `config/required-status-checks.json`, `.github/workflows/**`                                                                                                                                            | CI/ruleset owner; changes the merge gate.                                                                              |
| Files pinned by source-reading tests                                                                                                                                                                    | `git grep -l "<path or exported name>" origin/verdant-grow-diary -- src/test` and renegotiate pins in the same change. |

### S3. Existing changes

For the path list from S2:

1. **Open PRs.** List every open PR into `verdant-grow-diary` and intersect its changed files
   with the path list: `gh api 'repos/Verdant-OS/verdant-grow-diary/pulls?state=open&per_page=100'`,
   then `gh api 'repos/Verdant-OS/verdant-grow-diary/pulls/<n>/files?per_page=100'` per PR.
   Include drafts and stacked PRs, whose base is another PR's branch, not the deploy branch.
2. **Same topic, different files.** Search open PR titles and bodies for the feature's keywords.
   Two implementations of one behaviour are a collision even with zero shared files.
3. **Recently merged.** `git log --since="14 days ago" --format='%h %ad %s' origin/verdant-grow-diary
-- <paths>` and title search of merged PRs. If the change already shipped, the edit is a
   duplicate.
4. **Merge risk.** For each overlapping open branch, `git merge-tree --write-tree
origin/verdant-grow-diary origin/<branch>` shows whether it already conflicts; note which
   would need a merge-up if the other lands first.

### S4. Ownership

For each overlapping PR, branch or task:

1. **Author and seat.** Branch prefix (`codex/`, `claude/`, `cursor/`, …) and PR author. On the
   shared `cheekhimself` account, comments may come from agent sessions; authority from the
   owner comes from the conversation, not from a PR comment.
2. **Effective claim.** The newest valid `claimed_by` in `docs/agents/HANDOFF_LOG.md` or in a
   claim comment on the PR. A fresh claim, an explicit assignment and a named path or PR lock
   are not available for takeover. A claim older than 24 hours with no activity may be resumed
   only after posting a new claim, and only when the user's task calls for it.
3. **Role owners.** `docs/agents/OWNERSHIP.md` for who merges, reviews and owns CI, connectors
   and governance files. It wins over `CURRENT_STATE.md` and `AGENTS.md` on ownership.
4. **Live sessions.** Where the session tools are available, list sessions and match branch
   names, to catch work that is in progress but not yet pushed.

## 4. Verdict

Exactly one:

| Verdict       | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `CLEAR`       | No open or recently merged change touches these files or this behaviour; no protected class is hit.         |
| `COLLISION`   | Another open PR, claim or session covers the files or the behaviour. Name it; do not resolve it.            |
| `NEEDS_OWNER` | No collision, but a protected class needs explicit owner approval before anyone edits.                      |
| `BLOCKED`     | A required read failed (API refused, file unreadable, sessions unavailable). Say which, and what clears it. |

A collision is reported, never fixed: do not rebase another agent's work, push to its branch,
open a competing PR, or close anything. When a collision exists, offer the user the routes:
relay the change to the current owner, wait for it to land, or ask the owner to reassign.

## 5. Output

```text
COLLISION GUARD — <one-line edit>
deploy_tip: <full sha>  observed: <UTC time>
local: <branch>, <clean | N uncommitted | N unpushed>
files:
  - <path> [EXISTS|NEW] [protected: <class> | —]
existing_changes:
  - #<n> <draft|ready> <branch> — overlaps: <paths or "same behaviour"> — merge-tree: <clean|conflict>
  - merged: <sha> <subject> (<date>)
ownership:
  - #<n>: author <seat>, claim <who, when | none>, lock <name | none>, live session <id | none | NOT_MEASURED>
checks: state PASS|BLOCKED · files PASS|BLOCKED · changes PASS|BLOCKED · ownership PASS|BLOCKED|NOT_MEASURED
verdict: CLEAR | COLLISION | NEEDS_OWNER | BLOCKED
next: <the single smallest next step, for the user to approve>
```

Then stop.

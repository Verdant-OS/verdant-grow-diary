---
name: verdant-collision-guard
description: Read-only pre-edit check for Verdant-OS/verdant-grow-diary. Verifies the deploy-branch state, the exact files a proposed edit would touch, every existing open or recently merged change to those files, and who owns that work, then stops with a verdict and does not edit. Use before writing code, docs or config, before committing or pushing, when asked to "run collision guard" or "check for collisions", and whenever another agent, session or PR may already be working in the same area.
---

# verdant-collision-guard — check before you touch

`AGENTS.md` (Multi-Agent Coordination) says: check recent merged PRs and open PRs before
substantial work, never build a second implementation, and report a collision instead of
resolving it. This skill turns that rule into a fixed procedure with one output.

This file carries procedure only. Operating facts — open PRs, claims, holds, locks, untouchable
PRs, who owns which slice — live in `docs/agents/OWNERSHIP.md`, `docs/agents/HANDOFF_LOG.md` and
`docs/agents/CURRENT_STATE.md`. Read them at run time from the deploy branch; never answer from
memory. Where this file and `AGENTS.md` (Agent Handoff / Coverage) differ on claim rules,
`AGENTS.md` wins.

## 1. Contract

- **No working-tree or remote changes.** Allowed: `git fetch`, `git log`, `git show`,
  `git ls-tree`, `git merge-tree`, `git --no-optional-locks status`, `gh api` GET requests,
  reading files, listing sessions, and deleting the scratch refs S3 creates under `refs/guard/`.
  Fetching and `merge-tree` update local refs and the object store only; with
  `--no-optional-locks`, `status` does not rewrite the index. None of these touches the working
  tree, the index or the remote. Not allowed: editing,
  staging, committing, pushing, commenting, labelling, claiming, releasing, closing, re-running
  checks, or messaging another session to change its work.
- **Stops after the verdict.** The guard never proceeds to the edit, even on `CLEAR`. The user,
  or the task's explicit instruction, starts the edit afterwards.
- **Needs a concrete edit.** If no proposed edit is named, ask for it. Do not guess one from
  conversation history.
- **Fresh every time.** A result is valid only for the deploy-branch SHA and PR snapshot it
  records. Any push, merge, new PR or new claim afterwards makes it stale; re-run before acting.

## 2. Inputs

1. The proposed edit, in one sentence.
2. Any files, PRs or branches the user already named.
3. The branch this session is assigned to push to, if any.

## 3. Procedure

Run every step. A step that cannot be measured is `BLOCKED` (a required read failed) or
`NOT_MEASURED` (an optional signal was not available), never skipped silently and never a pass.

### S1. Current state

1. Fetch the deploy branch with an explicit refspec, so a single-branch clone still updates
   the ref every later step reads, then record the full tip SHA:

   ```bash
   git fetch origin +refs/heads/verdant-grow-diary:refs/remotes/origin/verdant-grow-diary
   git rev-parse origin/verdant-grow-diary
   ```

   The deploy branch is `verdant-grow-diary`, not `main`; never audit `main`. If the fetch fails,
   the verdict is `BLOCKED`.

2. `git --no-optional-locks status --short` and the current branch. Report uncommitted or unpushed local work; do
   not discard it.
3. If a session branch is assigned: does it exist on the remote, does it carry commits not in
   the deploy tip, and does it already have an open, merged or closed PR? A merged PR means
   follow-up work restarts from the deploy tip on a new PR.
4. Read the deploy-branch copies, not a task branch's:
   `git show origin/verdant-grow-diary:docs/agents/OWNERSHIP.md`,
   `git show origin/verdant-grow-diary:docs/agents/HANDOFF_LOG.md` and
   `git show origin/verdant-grow-diary:docs/agents/CURRENT_STATE.md`. Note every standing hold,
   untouchable PR, off-limits area and named lock that mentions the area.

### S2. Exact files

Resolve the edit to a concrete path list against the deploy tip
(`git ls-tree -r --name-only origin/verdant-grow-diary`). Mark each path `EXISTS` or `NEW`, and
name the symbol or line anchor when the edit is narrower than a file. Then classify each path:

| Class         | Paths or areas                                                                                                                                                                                                                                                                                     | Effect                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Owner fence   | Production database access of any kind (the standing production-database lock in `OWNERSHIP.md`), migrations and SQL not yet merged, anything under `supabase/`, RLS, auth, Edge Functions, the Action Queue, lockfiles, device control, and any area `OWNERSHIP.md` currently lists as off-limits | `NEEDS_OWNER` (Matthew alone). A slice assignment alone does not lift it.                              |
| Immutable     | Any migration file already on the deploy branch                                                                                                                                                                                                                                                    | `REJECT`. No approval route exists; the valid proposal is a new additive migration.                    |
| Held          | A path in the diff of a PR on hold, or any path `OWNERSHIP.md` or `CURRENT_STATE.md` marks untouchable                                                                                                                                                                                             | `COLLISION`. Never touch while the hold stands.                                                        |
| Never by hand | `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts`, `supabase/functions/_shared/lib`                                                                                                                                                                  | `REJECT` as a hand edit. The valid proposal regenerates them with the repo's tooling.                  |
| Governance    | The seventeen versioned files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.grok/rules/verdant-grok-role.md`, `docs/agents/README.md`, `docs/agents/HANDOFF_PROTOCOL.md`, and the eleven `docs/agents/roles/*.md` (`grok`, `claude`, `codex`, `gemini`, `canopy`, `graft`, `root-cause`, `trellis`, `verdante`, `chemdawg`, `golden-toad`) | Allowed, but the same change bumps all seventeen `Sentinel-Version`s. Report it; not a verdict by itself. |
| Merge gate    | `config/required-status-checks.json`, `.github/workflows/**`                                                                                                                                                                                                                                       | `NEEDS_OWNER` (the CI owner `OWNERSHIP.md` names).                                                     |
| Pinned        | Any path or exported name a test reads as source text (`git grep -l "<path or name>" origin/verdant-grow-diary -- src/test`)                                                                                                                                                                       | Informational. The edit must renegotiate those pins in the same change.                                |

### S3. Existing changes

For the path list from S2:

1. **Open PRs.** List every open PR, drafts and stacked PRs included (a stacked PR's base is
   another PR's branch), and intersect each one's files with the path list. Paginate both
   calls:

   ```bash
   gh api --paginate 'repos/Verdant-OS/verdant-grow-diary/pulls?state=open&per_page=100'
   gh api --paginate 'repos/Verdant-OS/verdant-grow-diary/pulls/<n>/files?per_page=100'
   ```

2. **Same behaviour, different files.** Search open PR titles and bodies for the feature's
   keywords. Two implementations of one behaviour are a collision even with no shared file.
3. **Recently merged.** Check what already landed on these paths:

   ```bash
   git log --since="14 days ago" --format='%h %ad %s' origin/verdant-grow-diary -- <paths>
   ```

   A merged change that already does the edit makes it a duplicate (`COLLISION`). A merged
   change to the same file that does something else is context: report it, and read the
   current file before proposing anything.

4. **Merge risk.** For each overlapping open PR, fetch its head first, then test the merge:

   ```bash
   git fetch origin "+pull/<n>/head:refs/guard/pr-<n>"
   git merge-tree --write-tree origin/verdant-grow-diary refs/guard/pr-<n>
   git update-ref -d refs/guard/pr-<n>
   ```

   The leading `+` lets a re-run follow a rewritten PR head. `git merge-tree --write-tree` needs
   git 2.38 or later; exit status 0 means clean and 1 means conflicts. Note which PR would need
   a merge-up if the other lands first. If the fetch fails, or `merge-tree` exits with any other
   status or errors, report merge risk as `NOT_MEASURED`, never as clean, and do not test a ref
   left from an earlier run. Delete the scratch ref in every case.

### S4. Ownership

For each overlapping PR, branch or handoff block, apply `AGENTS.md` (Agent Handoff / Coverage):

1. **Author and seat.** The branch prefix (`codex/`, `claude/`, `cursor/`, …) and the PR author.
   A PR comment is not the owner's instruction; the owner's authority comes from the
   conversation with the owner.
2. **Effective claim.** Read the PR's comments, not only the log:

   ```bash
   gh api --paginate 'repos/Verdant-OS/verdant-grow-diary/issues/<n>/comments?per_page=100'
   ```

   The effective claim is the newest valid `claimed_by` among the deploy-branch log and the PR's
   claim comments, unless its holder later posted `released_by`. A release that names a
   successor reserves the block for that successor for 24 hours. A fresh claim is a valid claim
   whose block's last activity, as `AGENTS.md` defines it, is under 24 hours old; a claim posted
   while another agent's valid claim is under 24 hours old is not valid. A fresh claim, an
   explicit assignment and a named lock are not available for takeover. A block needs a pushed branch
   and a PR before it is eligible for coverage at all.

3. **Role seats and locks.** `OWNERSHIP.md` names who merges, who reviews and who owns CI and
   connectors, plus standing locks, holds and untouchable PRs. It names no single owner for the
   seventeen versioned governance files; report governance edits for review rather than routing
   them to a seat. Precedence:
   Matthew Cheek's own words, then `OWNERSHIP.md`, then `AGENTS.md`, then `CURRENT_STATE.md`.
   If `OWNERSHIP.md` and `CURRENT_STATE.md` disagree on whether a lock or hold still stands,
   treat it as standing and report the disagreement.
4. **Live sessions.** Where session tools are available, list sessions and match branch names,
   to catch work in progress but not yet pushed. If unavailable, record `NOT_MEASURED`; this
   alone never makes the verdict `BLOCKED`.

## 4. Verdict

This session's own assigned branch, its own PR and its own valid claim are never a collision
with itself. Everything else counts.

Exactly one verdict. When several apply, the first in this order wins:

| Verdict       | Meaning                                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKED`     | A required read failed: the deploy branch, the deploy-branch ownership files, the open-PR list or any PR's file list, the same-behaviour search, the merged-history log, or the PR comments of an overlapping PR. Say which, and what clears it. Only live sessions and merge risk may be `NOT_MEASURED`. |
| `REJECT`      | The proposal edits an immutable migration or hand-edits a generated file. No approval makes it valid; state the valid alternative.                                                                                                                                                                        |
| `COLLISION`   | An open PR, effective claim, explicit assignment, hold or untouchable entry covers the files or the behaviour, or a merged change already does it. Name it; do not resolve it.                                                                                                                            |
| `NEEDS_OWNER` | No collision, but an owner-fence or merge-gate path is in scope. Name the fence and whose approval it needs.                                                                                                                                                                                              |
| `CLEAR`       | None of the above. Report governance, CI-owner and pinned-test notes alongside.                                                                                                                                                                                                                           |

A collision is reported, never fixed: do not merge into, rebase, push to or comment on another
agent's branch, open a competing PR, or close anything. Offer the user the routes: relay the
change to the current holder, wait for it to land, or ask for a reassignment.

## 5. Output

```text
COLLISION GUARD — <one-line edit>
deploy_tip: <full sha>  observed: <UTC time>
local: <branch>, <clean | N uncommitted | N unpushed>
files:
  - <path> [EXISTS|NEW] [owner-fence | immutable | held | never-by-hand | governance | merge-gate | pinned | —]
existing_changes:
  - #<n> <draft|ready> <branch> — overlaps: <paths or "same behaviour"> — merge-tree: <clean|conflict|NOT_MEASURED>
  - merged: <sha> <subject> (<date>) — <duplicate | context>
ownership:
  - #<n>: author <seat>, effective claim <who, when | released | none>, lock/hold <name | none>, live session <id | none | NOT_MEASURED>
checks: state PASS|BLOCKED · files PASS|BLOCKED · changes PASS|BLOCKED · ownership PASS|BLOCKED · sessions PASS|NOT_MEASURED
verdict: BLOCKED | REJECT | COLLISION | NEEDS_OWNER | CLEAR
next: <the single smallest next step, for the user to approve>
```

Then stop.

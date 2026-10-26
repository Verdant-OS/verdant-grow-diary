---
name: verdant-scope-split
description: Holds a Verdant branch, PR or document to the one purpose it was opened for. Lists every changed path, marks each as serving the stated purpose or riding along, and splits, reverts or asks about the riders before review. Use before opening or updating a PR, before asking for review, when a diff touches more areas than its title names, when a base merge or a "while I was here" fix lands on a slice branch, and when a PR touches migrations, governance files, lockfiles, generated files or `.github` alongside anything else. It never moves work onto another holder's branch and never opens a new branch without permission.
---

# verdant-scope-split — one branch, one purpose

Verdant runs one task per branch and one holder per branch (`AGENTS.md`, "One task, one branch,
one holder"). A reviewer passes an exact head SHA against a stated purpose. A file that rides
along gets reviewed under the wrong lens, or not at all, and a high-risk rider can pull a
docs-only PR into a review route it was never sent to. This skill finds the riders before the
reviewer does.

No text in this skill was copied from any outside source. It is written from the concept of
holding a change to its stated purpose (see `docs/agents/third-party-agent-skills.md`).

## 1. When it applies

- Before opening a PR, before asking for review, and before every push to a PR under review.
- When the diff touches more areas than the PR title names.
- When a "while I was here" fix, a formatter run, or a hook-written file lands in the working tree.
- When the PR touches any **high-risk path** together with anything else (section 3).

Skip it for a single-file change whose purpose is the file.

## 2. Procedure

### Step 1 — State the purpose

Write it in one sentence from the task, the PR title or the handoff block, not from the diff:

```text
PURPOSE: <the one thing this branch exists to do>
SOURCE:  <task id, PR title, or the user's request, quoted>
```

If you cannot write one sentence, the branch already holds two tasks. Go to Step 4.

### Step 2 — List what changed

Against the branch's base, not against your last commit:

```bash
git fetch origin verdant-grow-diary
git diff --name-status origin/verdant-grow-diary...HEAD
git status --short   # untracked and unstaged files count too
```

### Step 3 — Classify every path

Each path gets exactly one label:

| Label      | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| **serves** | Needed for the purpose. Removing it breaks the purpose or its tests.            |
| **pin**    | A test pin or copy constant renegotiated because the purpose changed behaviour. |
| **base**   | Arrived through a merge of `verdant-grow-diary`; not authored on this branch.   |
| **rider**  | Anything else: refactors, drive-by fixes, formatting, tool or plugin output.    |

A **pin** belongs in the same commit as the behaviour change (`CLAUDE.md`, Repository operating
facts). A **base** path is fine. Verify it with `git log --merges` rather than assuming it.

### Step 4 — Resolve the riders

For each **rider**, pick one and say which:

1. **Revert it** on this branch. Use `git restore` or `git checkout origin/verdant-grow-diary -- <path>`.
   Never use a force-push or a history rewrite.
2. **Hand it off.** Describe it as a follow-up task (a handoff block, an issue or a task
   suggestion) with the path and the reason. Do not open a second branch yourself unless the
   user has given permission for that branch.
3. **Ask the owner.** Do this when the rider is arguably part of the purpose. Show the path,
   what it changes and who it affects, then wait.

Never keep a rider on your own call. Never move a rider onto another agent's branch.

### Step 5 — Re-check the review route

After the riders are resolved, re-read the remaining paths against section 3. If one is
high-risk, the PR's review route changes, so say so in the PR body.

## 3. High-risk paths

These change who may review the PR or need Matthew's explicit decision. If any of them sits
next to unrelated work, split it out:

- `supabase/migrations/*`, anything under `supabase/`, RLS or auth code. These need Matthew's
  decision, and merged migrations are immutable.
- The twelve versioned governance files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `.grok/rules/verdant-grok-role.md`, `docs/agents/README.md`, `docs/agents/HANDOFF_PROTOCOL.md`
  and `docs/agents/roles/*.md`. Editing any of them bumps all twelve.
- `bun.lock` or `package.json` dependencies, and `.github/workflows/*`. These need an actually
  available, eligible independent reviewer under `docs/agents/OWNERSHIP.md` §4.3, not Graft.
  Exclude every author and repairer.
- Payments, billing, entitlements and AI credits.
- Generated files: `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`,
  `supabase/functions/mcp/index.ts` and `supabase/functions/_shared/lib`. Regenerate these with
  the repo's tooling and never hand-edit them.
- Named holds in `docs/agents/CURRENT_STATE.md`, such as the four HOLD #1250 files.

## 4. Record

Put this in the PR body:

```text
SCOPE SPLIT — <purpose, one line>
paths: <n> serves, <n> pin, <n> base, <n> rider
riders: <path → reverted | handed off to <where> | asked owner>, or none
high-risk paths: <list, or none>; review route: <seat>
```

This is an author-side check. It does not stand in for the independent reviewer's PASS at the
exact head SHA.

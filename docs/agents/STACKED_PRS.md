# Stacked PRs — agent playbook

Short operating guide for **GitHub stacked pull requests** (native stacks +
manual branch-as-base) in `verdant-grow-diary`.

Related: [GitHub stacked PRs docs](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests),
[`gh-stack` CLI](https://github.com/github/gh-stack) (`gh extension install github/gh-stack`).

## When to stack

| Stack | Do not stack |
| --- | --- |
| True layer deps (schema → API → UI) | Unrelated fixes / docs |
| Reviewers need ≤ ~400 LOC per layer | One-shot agent feature PR |
| Same author, same land train | Soft follow-ups (open after base merges) |

**Default for agent work:** one PR off `verdant-grow-diary` (or `main` for
trunk-only docs). Stack only when a later layer cannot review without the earlier.

## Tooling

```bash
gh extension install github/gh-stack   # once per machine
gh stack --help
```

| Command | Use |
| --- | --- |
| `gh stack init [b1 b2 …]` | Start local stack (bottom → top) |
| `gh stack add <branch>` | New layer on top |
| `gh stack submit --auto` | Push + create/update PRs + stack object |
| `gh stack sync` | Restack after remote / lower-layer edits |
| `gh stack link 691 692` | Link **existing** PRs into a GitHub stack (bottom → top) |
| `gh stack merge --yes --squash` | Atomic merge via **merge-async** |
| `gh stack unstack` | Dissolve stack metadata (local + GitHub) |

## Two patterns we use

### A — Manual (branch as base)

```text
verdant-grow-diary
  └── PR#691  head: freshness-592
        └── PR#692  base: freshness-592  head: residual-592
```

- Merge **bottom first** when required checks are green.
- Then retarget top: `gh pr edit TOP --base verdant-grow-diary` **or**
  `git rebase origin/verdant-grow-diary && git push --force-with-lease`.
- Body of top PR: `Depends on #691`.

### B — Native GitHub stack

- Create with `gh stack submit` or `gh stack link <bottom> … <top>`.
- **Never** use classic `gh pr merge` / GraphQL `mergePullRequest` when
  `pull.stack != null` → always **`gh stack merge`** or
  `PUT /repos/{owner}/{repo}/pulls/{n}/merge-async`.
- Branch protection is evaluated against the **final trunk**, not the
  intermediate base.

## Pre-merge checklist (agents)

```bash
# 1. Is this PR in a stack?
gh api repos/Verdant-OS/verdant-grow-diary/pulls/N --jq '.stack // empty'

# 2. If stack is set, parent PR must still exist
gh pr view <stack.number> --json state,number
```

| Condition | Action |
| --- | --- |
| `stack` empty | Normal `gh pr merge` (if required checks green) |
| `stack` set, parent open | `gh stack merge N --yes --squash` (or merge-async) |
| `stack` set, parent **404 / closed without merge** | **Unstack + recreate** (see below) — do not retry merge forever |
| Required checks red | Do not merge; fix or unstack to a green single PR |

Poll async merge:

```bash
gh api -X PUT repos/OWNER/REPO/pulls/N/merge-async \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  -f merge_method=squash
# response includes details.uuid
gh api repos/OWNER/REPO/pulls/N/merge-async/UUID
```

## Dead-parent recovery (lesson from #634 → #701)

Symptom: UI `MERGEABLE`, classic merge **403** (“use asynchronous merge API”),
`merge-async` fails with *“must be open and not in draft”* while PR is open.

Cause: stack parent PR deleted/closed; stack metadata still points at it.

```bash
git fetch origin TRUNK
git checkout -B topic-unstacked origin/TRUNK
git cherry-pick <unique-commits-from-broken-PR>
git push -u origin topic-unstacked
gh pr create --base TRUNK --head topic-unstacked \
  --title "…" --body "Supersedes #OLD (dead stack parent)."
gh pr close OLD --comment "Superseded by #NEW (dead stack parent)."
# optional: gh stack unstack <stack-number>
```

## Restack onto current trunk (manual stack)

```bash
git fetch origin verdant-grow-diary bottom-branch top-branch

git checkout bottom-branch
git rebase origin/verdant-grow-diary
git push --force-with-lease

git checkout top-branch
git rebase bottom-branch
git push --force-with-lease

# Optional: promote to native stack
gh stack link bottom-branch top-branch
# or by PR numbers (bottom → top):
gh stack link 691 692
```

## Hygiene rules (non-negotiable)

1. **Do not close** a bottom PR while tops still base on its branch without
   retargeting or unstacking first.
2. Prefer **depth ≤ 3** unless someone owns `gh stack sync` for the train.
3. Agents: read `.stack` before every merge attempt.
4. Broken stack → unstack/recreate; do not force classic merge.
5. After bottom merges, immediately restack tops onto trunk (same turn).

## Related PRs / examples

| Case | Outcome |
| --- | --- |
| #634 stacked on deleted #648 | Unstacked as #701, **merged to `main`** as `ecc9ae4b95dcf34163d33465bc442566b359f8e2` (2026-08-03T23:07:46Z) |
| #681 docs agents state | **Merged to `verdant-grow-diary`** as `dd3b47570458c4afbaf6c2ae2736fccbefb7fedc` (2026-08-03T22:55:11Z) |
| #691 → #692 manual sensor-truth | Restack onto trunk; land #691 then #692 (or `gh stack merge`) — stack #702 |
| Flat agent PR (#699 Biome) | Keep unstacked; merge only when required checks green |

Exact merge SHAs also live in `docs/agents/CURRENT_STATE.md` → **Recent merge commit hashes**.

## See also

- `docs/agents/HANDOFF_PROTOCOL.md` — handoff format
- `docs/testing/ci-contract-hygiene.md` — CI traps for small PRs
- `scripts/check-pr-merge-ready.mjs` — fail-closed merge readiness (`bun run check:pr-merge-ready`)

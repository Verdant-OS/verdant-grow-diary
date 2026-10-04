---
name: verdant-exact-sha-review
description: The review and merge loop for Verdant-OS/verdant-grow-diary. Use when you review a pull request, hand one to a reviewer, or decide whether one may merge. Every verdict is tied to one exact head SHA, and only a clean PASS merges.
---

# Verdant exact-SHA review loop

This skill writes down the review loop that the Verdant agents already follow, so authors, reviewers and the merge-queue owner all work from one copy.

Use the shared box skill `code-review-and-quality` as the review checklist (correctness, readability, architecture, security, performance). Before asking for review, authors run the checklist in [docs/agents/recurring-review-findings.md](../../../docs/agents/recurring-review-findings.md).

## Roles

| Role                     | Who                                                         | Does                                                                                                                     | Never                                               |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Merge-queue owner        | Grok 91 / Chemdawg                                          | Routes PRs to reviewers, sends findings back to authors, enqueues a merge only after a clean PASS and Matthew's go-ahead | Reviews its own work                                |
| Code reviewer            | Blue Dream, Durban Poison (peers)                           | Returns one verdict on one exact SHA for `.tsx`/UI, auth, RLS, DB and Edge changes                                       | Writes code, pushes, merges, publishes, applies SQL |
| Docs / QA / SEO reviewer | Critical Mass                                               | Returns one verdict on one exact SHA for docs, QA, SEO and release-risk changes                                          | Same as above                                       |
| Author                   | Claude, Codex (or the owner, when the owner fixes findings) | Writes the change and fixes findings                                                                                     | Reviews its own change                              |

The owner of a change can't review it. Each slice has one owner and a different reviewer.

## 1. Exact SHA or BLOCKED

- Every handoff names the PR URL, the **full 40-character head SHA**, and any stay-draft constraints.
- The reviewer checks the head at the start and at the end of the review (`gh pr view <N> --json headRefOid,isDraft` or `git ls-remote`).
- If the head is missing, has moved, or doesn't match the handoff, the verdict is **BLOCKED** and the reviewer does not review.
- A verdict covers that SHA only. It never carries over to a later commit.

## 2. Verdicts

Return exactly one:

| Verdict        | Meaning                                                                                 | What happens next                               |
| -------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `PASS`         | No P1, no P2                                                                            | Eligible to merge, subject to the gates below   |
| `PASS-with-P2` | No P1, at least one P2                                                                  | Goes back to the author. **It does not merge.** |
| `FAIL`         | At least one P1                                                                         | Goes back to the author                         |
| `BLOCKED`      | The review couldn't start: missing or moved SHA, missing access, a broken precondition  | Fix the precondition and re-send                |
| `NOT_MEASURED` | The claim couldn't be measured (for example production behaviour, or CI that never ran) | Say exactly what wasn't measured                |

## 3. Findings

- **P1:** wrong behaviour, a safety or data-integrity break, a fail-open guard, or a claim the code contradicts.
- **P2:** a fixable gap that doesn't break behaviour today. Examples: an unpinned guard, a PR description that claims more than the code does, duplicated logic, untested doc wording.
- Every finding gives `file:line`, the evidence (a command, a mutation, or a quoted line), and a concrete fix.
- Nits are optional and never block.
- Each verdict ends with what it does **not** claim (for example production behaviour, a full `tsc`, test suite or build run).

## 4. Only a clean PASS merges

- `PASS-with-P2` and `FAIL` both go back to the author. The author pushes a new commit with a normal push (hooks on, no `--no-verify`, no force-push of reviewed history).
- The new head gets a **full re-review**, not a diff-only skim. Earlier verdicts don't carry over.
- A PR stays **draft** until it merges.
- Before merge, **all 35 required checks must be green at the merge head** (`gh pr checks <N> --required`). Checks from an older head don't count.
- Merging also needs Matthew's go-ahead, and it goes through the merge queue (see [docs/agents/merge-queue.md](../../../docs/agents/merge-queue.md)).

## 5. Re-review triggers

The reviewer lists them in every verdict. At minimum:

- Any new commit on the PR.
- A base-branch move that touches the files, routes, schemas or docs the verdict relied on.
- A change to the PR description's claims (counts, scope, safety statements).
- A required check that turns red, or a check set that changes.

## 6. Held for Matthew

- **Migration PRs** (anything under `supabase/migrations/`) are held for Matthew's decision even after a clean PASS. A reviewer PASS is not permission to apply SQL.
- Production database writes, Publish, Edge deploys, device control and the automatic Action Queue need Matthew to name the exact action.

## 7. Standing gates

These stand until Matthew lifts them. The live list is kept on the agents' shared box at `/workspace/shared/context/fleet-locks.md`; when this list and that file disagree, the file wins.

- **No Publish** without Matthew.
- **knk production database lock:** no writes, no drive-by queries.
- **HOLD #1250:** recorded as a standing gate. Check the live list for its current state.
- Migration PRs held for Matthew (section 6).
- Off-limits to agents unless Matthew names the action: auth, RLS, migrations, Edge functions, `supabase/`, lockfiles.

## Verdict template

```text
[VERDICT] <reviewer>: #<N> @ <full SHA>: <PASS|PASS-with-P2|FAIL|BLOCKED|NOT_MEASURED>, <n> P1, <n> P2. Required checks <x>/35. Head unchanged start and end; draft=<true|false>.
P1: <file:line> <evidence> <fix>
P2-1: <file:line> <evidence> <fix>
Re-review triggers: <list>
Not claimed: <list>
Packet: /workspace/shared/handoffs/<N>-<short sha>-<reviewer>.md
```

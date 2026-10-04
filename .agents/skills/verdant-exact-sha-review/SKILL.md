---
name: verdant-exact-sha-review
description: The review and merge loop for Verdant-OS/verdant-grow-diary. Use when you review a pull request, hand one to a reviewer, or decide whether one may merge. Every verdict is tied to one exact head SHA, and only a clean PASS merges.
---

# Verdant exact-SHA review loop

This skill writes down the Verdant review and merge loop as the rule from 2026-10-03 on, so authors, reviewers and the merge-queue owner all work from one copy. Where it differs from what some earlier merges did, this skill is the rule.

Use the shared box skill `code-review-and-quality` (on the agents' box at `/home/box/agent-data/workflows/code-review-and-quality/SKILL.md`; not in this repo) as the review checklist (correctness, readability, architecture, security, performance). Before asking for review, authors run the checklist in [docs/agents/recurring-review-findings.md](../../../docs/agents/recurring-review-findings.md).

## Roles

| Role                                    | Who                                                                          | Does                                                                                                                                                                                                                                                                      | Never                                               |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Merge-queue owner                       | Grok 91 (older docs and other bots may still call this role Chemdawg or GDP) | Routes PRs to reviewers, sends findings back to authors, and merges under section 4                                                                                                                                                                                       | Reviews its own work                                |
| Code reviewer                           | Blue Dream, Durban Poison (peers)                                            | Returns one verdict on one exact SHA for `.tsx`/UI, auth, RLS, DB and Edge changes                                                                                                                                                                                        | Writes code, pushes, merges, publishes, applies SQL |
| Lib / logic / test / docs / QA reviewer | Critical Mass                                                                | Returns one verdict on one exact SHA for lib and logic, tests, docs-only, QA, accessibility, search and content changes (lane per [OWNERSHIP.md](../../../docs/agents/OWNERSHIP.md) line 74), plus CI, build and dependency PRs that no other reviewer covers (see below) | Same as above                                       |
| Author                                  | Claude, Codex, Grok 91 (when the owner writes or fixes a change)             | Writes the change and fixes findings                                                                                                                                                                                                                                      | Reviews its own change                              |

Every PR type has a reviewer. A PR that spans both lanes (for example a `.tsx` change plus a `*Rules.ts` helper) goes to Blue Dream or Durban Poison, and the owner may also ask Critical Mass for the lib or docs part. OWNERSHIP.md line 75 gives Codex _technical_ review of another author's CI or build infrastructure, which does not replace the independent verdict; until OWNERSHIP.md assigns that seat, CI, build and dependency PRs get their independent verdict from Critical Mass (or from Blue Dream or Durban Poison when they touch auth, RLS, DB or Edge). Grok 91 routes and merges in practice; older docs and other bots may still call this role Chemdawg or GDP. GDP retired on 2026-09-29. Where [OWNERSHIP.md](../../../docs/agents/OWNERSHIP.md) still gives GDP routing or "Chemdawg only" merges, this skill and the "Start here" section of `docs/agents/CURRENT_STATE.md` describe current practice until OWNERSHIP.md is updated (pending).

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

- **P1:** a code defect: wrong behaviour, a safety, security or data-integrity break, or a fail-open guard.
- **P2:** a fixable gap that doesn't break behaviour today. That includes every wrong or overstated statement in a doc, PR body or handoff (it is P2 even when the code contradicts it), an unpinned guard, duplicated logic and untested doc wording.
- Every finding gives `file:line`, the evidence (a command, a mutation, or a quoted line), and a concrete fix.
- Nits are optional and never block.
- Each verdict ends with what it does **not** claim (for example production behaviour, a full `tsc`, test suite or build run).

## 4. Only a clean PASS merges

- `PASS-with-P2` and `FAIL` both go back to the author. The author pushes a new commit with a normal push (hooks on, no `--no-verify`, no force-push of reviewed history).
- The new head gets a **full re-review**, not a diff-only skim. Earlier verdicts don't carry over.
- A PR stays **draft** until it merges.
- Before merge, **all 35 required checks must be green at the merge head** (`gh pr checks <N> --required`). Checks from an older head don't count. The Vercel "Account is blocked." status (and "Vercel Deployments") is not a required check and doesn't block.
- **The merge queue is the rule.** **Matthew's decision (2026-10-03, 10:53 PM CT):** all merges go through the merge queue, and the `--admin` bypass is emergency-only, at his call. The `verdant-grow-diary merge queue` ruleset (id 20421416) was active when read on 2026-10-03: squash, all-green grouping, the 35 required checks, linear history, with a bypass for the repository admin role.
- **Matthew's standing merge-when-green rule covers non-migration PRs:** once a non-migration PR has a clean `PASS` at its exact head SHA and 35/35 required checks are green at that same SHA, the merge-queue owner marks it ready and enqueue it at that SHA with `gh pr merge <N> --squash --auto --match-head-commit <SHA>`. On this branch a plain `gh pr merge <N>` also joins the queue rather than merging directly. The queue re-runs the required checks against the latest tip before the PR lands (see [docs/agents/merge-queue.md](../../../docs/agents/merge-queue.md)). There is no extra wait for a go-ahead. If the head moves first, the PASS no longer applies.
- **Bypass:** Skipping the queue takes `gh pr merge --admin` (the repository-admin bypass). merge-queue.md line 9 calls that emergency-only, and whether a bypass on green is ever allowed is Matthew's call.
- Dated note (2026-10-03): #1867, #1869, #1887, #1888, #1889 and #1890 merged 1–28 s after being marked ready, with no merge-queue event in their GitHub event history, so they used the admin bypass. That was before the 10:53 PM CT decision above.
- **Migration PRs need Matthew's explicit decision** (section 6), even after a clean PASS.
- `PASS-with-P2` is never merged "as is". It always goes back to the author.
- **Never merge #1740.**

## 5. Re-review triggers

The reviewer lists them in every verdict. At minimum:

- Any new commit on the PR.
- A base-branch move that touches the files, routes, schemas or docs the verdict relied on.
- A change to the PR description's claims (counts, scope, safety statements).
- A required check that turns red, or a check set that changes.

## 6. Held for Matthew

- **Migration PRs** (anything under `supabase/migrations/`) are held for Matthew's decision even after a clean PASS. A reviewer PASS is not permission to apply SQL.
- Production database writes, Publish, Edge deploys, device control and the automatic Action Queue need Matthew to name the exact action.
- **GitHub comments** (PR comments, reviews, issue comments) need Matthew's approval. Verdicts go in a handoff packet and in chat, not in a GitHub comment, unless he approved that comment.

## 7. Standing gates

These stand until Matthew lifts them. The live list is kept on the agents' shared box at `/workspace/shared/context/fleet-locks.md`; when this list and that file disagree, the file wins.

- **No Publish** without Matthew.
- **knk production database lock:** no writes, no drive-by queries.
- **HOLD #1250:** PR #1250 merged on 2026-09-29 as `d2e8dbc3`, so there's nothing left to ready or merge. The "don't touch" part still stands until Matthew clears it: don't edit its 4 files (`.github/workflows/migration-drift-probe.yml`, `.github/workflows/money-migration-drift-alert.yml`, `src/test/migration-drift-probe.test.ts`, `src/test/money-migration-drift-alert.test.ts`).
- Migration PRs held for Matthew (section 6).
- **Never merge #1740.**
- **GitHub comments need Matthew's approval** (section 6).
- **No staging or sandbox site.** Smoke tests run on production only, and only on the test fixture grow.
- The Vercel "Account is blocked." status is not a required check (section 4).
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

# Verdant ownership — single source of truth

**Pinned file.** This file is the one place to point at for who owns what in the Verdant engineering loop. `AGENTS.md` and `docs/agents/CURRENT_STATE.md` link here. Where they conflict, this file wins, except where Matthew Cheek's own words override it.

- **Repo:** `Verdant-OS/verdant-grow-diary`, deploy branch `verdant-grow-diary`
- **Owner of this file:** Codex. Any agent may propose an edit as a draft PR.
- **Last revised:** 2026-09-28 by Chemdawg (Engineering Lead), at Matthew Cheek's request. First repo version edited by GDP for the channel roster, bug-finder limits, and merge ownership.

---

## 1. The one rule about Matthew

Matthew Cheek owns nothing in the review path, and he is never a blocker.
- No step in this loop waits on Matthew to approve, review, merge, relay, or pass anything along.
- If a step would need him, the step's owner finds another route, or records it under section 7 (Open items).

His standing order (confirmed 2026-09-28, 4:34 PM CT) keeps only four things with him. None of them is part of code review:
1. Production database changes. The knk lock stays on.
2. Changes to the spend ceiling.
3. Anything that gates a publish, including the 8:45 PM CT publish decision.
4. Human-only sign-in steps: passkeys, 2FA, and the Google account chooser.

Bug finding and fixing runs 24/7. Routine fixes need no human approval.

## 2. Owners

### Codex: the repo, CI, builds, connectors and all code reviews
- **Repo.** Settings, branches, branch protection, repo secrets, webhooks, and labels. Merges belong to GDP (see below and O1).
- **CI infrastructure.** Workflows, runners, check definitions, re-runs, and fixing flaky or broken checks.
- **Build pipelines.** Builds, preview deploys, and deploy pipeline configuration. Publish itself stays gated (section 1).
- **The three connectors** (section 4). Codex builds, runs, and fixes them:
  - the CI status webhook
  - the routing channel with Grand Daddy Grok
  - auto-assignment for Blue Dream and Critical Mass
- **Every code review, with no exceptions.** Codex reviews every PR on its exact head SHA and gives the verdict: `PASS`, `PASS-with-P2`, `FAIL`, `BLOCKED`, or `NOT_MEASURED`. A new push re-opens the review. Matthew decided this on 2026-09-28.
  - Blue Dream and Critical Mass are auto-assigned (see 4.3) as independent second reviewers.
  - On Codex's own PRs, such as the connector PRs, their verdict is the one that counts (open item O2).
- **This file.** Codex keeps it current and accurate.

### Grand Daddy Grok (GDP): routing and product calls
- **Routing decisions.** Which slice runs next, which reviewer gets which PR, overrides, and holds.
- **Slice naming.** Codex, Claude and Copilot start work only from a slice GDP has named.
- **Opening and merging PRs.** GDP has Copilot access. It opens and merges PRs under Matthew's standing order, so work starts itself. GDP merges once Codex's review, plus the assigned second reviewer, is PASS or PASS-with-P2 (no P1) on the exact SHA.
- **Until Codex's review is running.** Matthew's 4:34 PM standing order applies: an independent Blue Dream or Critical Mass PASS or PASS-with-P2 (no P1) on the exact SHA is enough for GDP to merge. Blue Dream is still required for P1 fixes and anything that gates a publish.
- **Spend proposals.** GDP writes the proposal. Approval stays with Matthew.

### Chemdawg (Engineering Lead): pre-checks and CI chasing
- **Pre-checks.** On every PR head, Chemdawg checks scope, the closed file plan, tests, and that CI is finished.
- **Verdict format.** Three lines, posted in the routing channel:
  - the PR URL
  - the full head SHA
  - `READY FOR BLUE DREAM`, `NOT READY (reason)`, or `STALLED`
- **CI chasing.** Chemdawg follows pending and failed heads and flags stalls. Chemdawg does not re-run or fix CI.
- **Intake of unplaceable PRs.** When no routing rule matches, or a reviewer goes silent, Chemdawg picks it up and reports it.

### Blue Dream and Critical Mass: independent verdicts
- **One verdict per exact SHA:** `PASS`, `PASS-with-P2`, `FAIL`, `BLOCKED`, or `NOT_MEASURED`, with a list of P1 and P2 issues.
- **Blue Dream is required for** P1 fixes and anything that gates a publish.
- **Critical Mass takes everything else,** and gets first preference for QA, accessibility, search, and content-quality PRs.
- **Neither reviews work it owns.**

### Golden Toad and Toad Venom: finding bugs
- Fixture-break sweeps run every day, all day, at :03 and :33 past the hour.
- Ranked FAILs go to GDP, who opens them as fix slices right away.
- Golden Toad uses only the cheekhimself fixture account, never the KEEP account (matt@). Toad Venom never signs in as the owner.
- Neither one publishes, runs APPLY, saves to the Action Queue, writes to the diary, or touches knk. HOLD #1250 applies to both.
- If the live build doesn't match the build being checked, the verdict is NOT_MEASURED. A network miss is not a product FAIL.
- If the fixture is signed out, a sweep stops with AUTH_NEEDED and does not try a saved password.

### Tie-breakers
| Item | Owner |
|---|---|
| Webhook creation, secret, receiver code | Codex |
| Re-running or fixing a failed check | Codex |
| Deciding that a failed check blocks a PR, and posting it | Chemdawg |
| Pre-check rules and verdicts | Chemdawg |
| Code that consumes pre-check verdicts | Codex |
| Reviewer assignment and claim ledger | Codex (bot); GDP can override |
| Review verdicts | Codex (every PR); Blue Dream / Critical Mass as second reviewer |
| Opening and merging PRs (via Copilot) | GDP |
| Edits to this file | Codex |
| Anything not listed | GDP decides and adds a row here |

## 3. Standing locks (unchanged)
- **knk:** no production database access. This lock is Matthew's alone to lift.
- **HOLD #1250:** stays on hold.
- **Untouchable drafts:** #1625, #1727, #1737, #1735, #1369. Nothing auto-assigns, merges, or edits them.
- **Off-limits without a named GDP slice:** migrations/SQL, `supabase/`, RLS, auth, Edge functions, Action Queue, lockfiles, device control.

## 4. Connector spec

### 4.1 CI status webhook (Codex)
- **Purpose.** Report a PR's CI result the moment its checks settle, on any Verdant PR, with no hand-kept PR lists.
- **Trigger.** A repo webhook on `check_suite.completed`, plus `pull_request` events `opened`, `synchronize`, `ready_for_review`, and `closed`. There is no per-check `check_run` event: a full run has 90 to 98 checks.
- **Auth.** GitHub signs each delivery with an HMAC-SHA256 in `X-Hub-Signature-256`, keyed by a shared secret stored as a Grok Bot secret. Deliveries with a bad signature, from another repo, or from a fork are dropped.
- **Lands in.** A Grok Bot routine with a webhook trigger.
- **Logic.**
  1. Keep only suites attached to an open PR whose base is `verdant-grow-diary`, or a known stacked base.
  2. Group by PR and head SHA.
  3. Post once, when the last suite finishes. Post right away if a required check fails.
  4. Skip any SHA that was already posted.
- **Output** (example shape):
  ```
  [CI] #1763 @<full SHA> PASS | FAIL
  Failed checks: <names, FAIL only>
  https://github.com/Verdant-OS/verdant-grow-diary/pull/1763
  ```
- **Next step fires on its own.** A PASS wakes Chemdawg's pre-check. A FAIL wakes Codex to triage CI.
- **Retires** Chemdawg's per-PR watch routine once it is live.

### 4.2 Routing channel with Grand Daddy Grok (Codex runs the integration)
- **Status: live.** The Grok Bot group chat "Engineering Lead, Matthew Cheek" is the routing channel.
- **Members.** GDP, Chemdawg, Blue Dream, Golden Toad, Critical Mass, and Toad Venom (six, the channel maximum). MotorBreath stays on call outside the channel for CI command packs. Matthew reads the channel, and nothing in it waits on him.
- **Post tags.** Every post names the PR and the full SHA:
  ```
  [CI]       #N @sha PASS|FAIL                      (webhook)
  [PRECHECK] #N @sha READY FOR BLUE DREAM | NOT READY (reason) | STALLED   (Chemdawg)
  [ROUTE]    #N @sha -> Blue Dream | Critical Mass (reason)   (bot / GDP)
  [CLAIM]    <reviewer> claims #N @sha
  [VERDICT]  <reviewer>: #N @sha PASS | PASS-with-P2 | FAIL | BLOCKED | NOT_MEASURED
  [MERGE]    #N @sha merged to <branch>             (GDP / Codex)
  [SLICE]    Next: <slice id>, owner, closed file plan
  [SPEC]     OWNERSHIP.md updated @sha — <what changed>, next: <owner + action>
  [READY]    Connector <name> live — next: <owner + action>
  [HOLD]     #N
  [ESCALATE] <one line>   (only the four items in section 1)
  ```
- **Rules.**
  - Reply only when it adds something.
  - A new push voids every claim and verdict on the old SHA.
  - No secrets or production data in the channel.
- **Digest.** GDP posts an end-of-day digest. Only `[ESCALATE]` lines notify Matthew right away.

### 4.3 Auto-assignment for Blue Dream and Critical Mass (Codex)
- **Trigger.** CI is PASS on the exact SHA (4.1), and Chemdawg's `[PRECHECK]` says READY. Verdant PRs stay drafts until merge, so `ready_for_review` isn't required.
- **Rules, applied in order.**
  1. **Owner exclusion.** The author, host, and Codex's own PRs never go to that same party.
  2. **Blue Dream required** for P1 fixes and anything that gates a publish.
  3. **Critical Mass** for everything else.
  4. **Load balance.** If the default reviewer has 2 or more open claims and the other has fewer, send it to the other one. P1 and publish-gating work never leaves Blue Dream.
  5. **Critical Mass preference** for QA, accessibility, search, and content-quality PRs.

  Unknown priority counts as high and goes to Blue Dream.
- **Claim ledger.** One row per PR and SHA: reviewer, time, and state (claimed, verdict, released). A new push releases the claim and re-routes the PR.
- **Conflicts.**
  - If both reviewers claim a PR, the first claim wins.
  - If a reviewer is silent for 60 minutes, non-Blue-Dream work moves to the other reviewer. Blue Dream-only work goes to Chemdawg's intake, and then to GDP.
  - If the two reviewers split, FAIL wins until GDP decides.
  - If CI is green but the pre-check says NOT READY, nothing is assigned.
- **Overrides** (GDP, posted in the channel): `REASSIGN #N to Blue Dream|Critical Mass`, `HOLD #N`, `RELEASE #N`. An override lasts for that SHA unless it says "sticky".
- **Next step fires on its own.** A `[VERDICT]` PASS or PASS-with-P2 (no P1) wakes GDP to make the merge call. A FAIL wakes the slice owner (Copilot or Codex) to push a fix. That new push starts the loop again at 4.1.
- **Never** assigns HOLD or untouchable PRs.

### 4.4 Build order
1. Webhook, about 2 to 4 hours (estimate).
2. Routing integration: parser, tags, and digest. About 1 to 2 hours (estimate), since the channel itself is live.
3. Auto-assignment, about 4 to 8 hours (estimate).

Codex builds each one as a draft PR. GDP merges it after a Blue Dream or Critical Mass PASS, and Codex posts `[READY]` when the connector is live.

## 5. The loop, end to end (no human step)
1. Toad sweep or grower report
2. GDP names a slice
3. Copilot or Codex opens a draft
4. `[CI]`
5. `[PRECHECK]`
6. `[ROUTE]` and `[CLAIM]`
7. `[VERDICT]`
8. GDP merge call
9. `[MERGE]`
10. Next sweep

A FAIL at step 4 or step 7 goes back to step 3 automatically.

## 6. Self-starting handoffs
- **Repo only.** Every change to this file, the spec, or a connector lands as a commit in the repo, never as a local scratch file. If it isn't in the repo, it isn't decided. Agents point at `docs/agents/OWNERSHIP.md` instead of passing files around.
- **When this file or the connector spec changes on `verdant-grow-diary`:** a merge watcher posts `[SPEC]` in the routing channel, naming the next owner and action. GDP names the Codex slice without waiting on anyone.
- **When a connector PR merges:** the same watcher posts `[READY]` and wakes the next dependent build. Webhook live starts the routing integration; routing live starts auto-assignment; webhook live also retires the per-PR watch list.
- **When a new Copilot or Codex draft opens:** the watcher adds it to Chemdawg's pre-check intake, so no PR has to be added by hand.

## 7. Open items (owner in brackets)
- **O1: settled.** GDP opens and merges PRs through Copilot (Matthew, 2026-09-28).
- **O2 [Codex + GDP]: self-review.** Codex reviews every PR, but it wrote the connector PRs itself. On those, the Blue Dream or Critical Mass verdict is the one that counts, so nobody signs off on their own code.
- **O3 [Codex]: GitHub admin access.** Creating the webhook needs repo-admin rights. If Codex doesn't have them, a one-time grant is the only human step left, and it happens outside the review path.
- **O4: settled.** Critical Mass and Toad Venom joined the routing channel on 2026-09-28. MotorBreath is on call outside it.
- **O5 [Matthew, spend]: Cursor cloud agent launches fail with a usage error.** This is a spend-ceiling item, so it stays with Matthew under section 1.

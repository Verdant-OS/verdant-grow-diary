# Verdant ownership — single source of truth

**Pinned file.** This file is the one place to point at for who owns what in the Verdant engineering loop. `docs/agents/CURRENT_STATE.md` links here, and this file wins over `CURRENT_STATE.md`. `AGENTS.md` points here too, and this file wins over it on ownership and routing. Matthew Cheek's own words override both.

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
2. Spend ceiling changes.
3. Anything that gates a publish.
4. The 8:45 PM CT publish decision.

Separately, some sign-in screens only a person can pass: passkeys, 2FA, and the Google account chooser. Those go to him when the screen requires it (standing since 2026-09-14).

Bug finding and fixing runs 24/7. Routine fixes need no human approval.

## 2. Owners

These are **role** owners: who merges, who reviews, who runs CI and connectors. They do
not make any task belong to one agent. The current holder may continue its open
task in `docs/agents/HANDOFF_LOG.md`; another agent may claim unclaimed work or a
claim stale for more than 24 hours after checking the latest state. Fresh claims,
explicit assignments and named path/PR locks are preserved. The merge and review
seats below still apply, and a claim never grants self-acceptance or merge authority.

### Codex: the repo, CI, builds, connectors, and CI/build reviews

- **Repo.** CI, builds and repository repairs. Matthew configures the separate scoped identity, branch rulesets and code-owner protections. Codex uses normal PR-branch pushes only: no force-push, merge, Publish, SQL apply or production Supabase writes. Drafts stay draft. Chemdawg merges only after 35/35 required checks succeed and Blue Dream, Durban Poison or Critical Mass gives an independent PASS on the exact head SHA. Production operations require Matthew's separate approval.
- **CI infrastructure.** Workflows, runners, check definitions, re-runs, and fixing flaky or broken checks.
- **Build pipelines.** Builds and deploy pipeline configuration, including making Vercel's Deployment Checks pass. There are no preview or staging targets. Promotion to production stays with the Vercel team owner, and the publish decision stays with Matthew (section 1).
- **The three connectors** (section 4). Codex builds, runs, and fixes them:
  - the CI status webhook
  - the routing channel with Grand Daddy Grok
  - auto-assignment for Blue Dream and Critical Mass
- **Technical reviews of CI and build-infrastructure PRs only.** Codex reviews another author's CI or build infrastructure on the exact head SHA. This technical review does not replace the standing independent acceptance gate: Blue Dream, Durban Poison or Critical Mass must independently accept the exact head before Chemdawg merges. Every other PR goes directly to its designated acceptance seat by file path (section 2, Chemdawg). Matthew approved Codex's CI/build remit on 2026-09-28 at about 5:03 PM CT, replacing the earlier every-PR rule.
  - An independent verdict on Codex's own work can come only from another seat. There is no author-integration exception; publish gates and named owner locks retain their fences (open item O2).
- **This file.** Codex keeps it current and accurate.

### Grand Daddy Grok (GDP): routing and product calls

- **Routing decisions.** Which slice runs next, which reviewer gets which PR, overrides, and holds.
- **Slice naming.** GDP routes priorities and named slices. Codex may start authorized repository repairs and resume a claimed handoff without waiting for another GDP paste. One task uses one branch and one current holder.
- **Opening PRs.** GDP routes work; Codex builds authorized repairs as drafts. Chemdawg owns merge under the current exact-head gate below.
- **Merge rule (Matthew's current standing order).** Chemdawg merges only after 35/35 required checks succeed and an independent PASS from Blue Dream, Durban Poison or Critical Mass covers the exact head SHA. Missing, skipped, pending or failed required checks are not green. P1 and publish gates retain their assigned review and hold fences.
- **Spend proposals.** GDP writes the proposal. Approval stays with Matthew.

### Chemdawg (Engineering Lead): pre-checks, CI status, and reviewer assignment

- **Pre-checks.** On every PR head, Chemdawg checks scope, the closed file plan, tests, and that CI is finished.
- **Verdict format.** Three lines, posted in the routing channel:
  - the PR URL
  - the full head SHA
  - `READY → <reviewer>`, `NOT READY (reason)`, or `STALLED`.
- **Reviewer assignment (Matthew, 2026-09-28 ~5:03 PM CT).** When a draft's CI settles green on real files, Chemdawg picks the reviewer by file path (see Blue Dream and Critical Mass below), posts `READY → <reviewer>` to GDP, and sends the review request straight to that reviewer: PR URL, full SHA, stay draft, no merge, no publish. PRs that touch off-limits paths, migrations included, are still routed by path for review. Chemdawg holds only their merge for Matthew (HOLD-CHEEK, section 4.3).
- **CI chasing.** Chemdawg follows pending and failed heads and flags stalls. Chemdawg does not re-run or fix CI.
- **Intake of unplaceable PRs.** When no routing rule matches, or a reviewer goes silent, Chemdawg picks it up and reports it.

### Blue Dream and Critical Mass: independent verdicts

- **One verdict per exact SHA:** `PASS`, `PASS-with-P2`, `FAIL`, `BLOCKED`, or `NOT_MEASURED`, with a list of P1 and P2 issues.
- **Blue Dream gets** P1 fixes, anything that gates a publish, and `.tsx` changes outside `src/test/`. Test-only `.tsx` changes follow the Critical Mass default unless P1 or publish-gating.
- **Critical Mass gets** lib, logic, test, and docs-only changes, plus QA, accessibility, search, and content-quality PRs.
- **Codex gets technical review** only for another author's CI or build infrastructure. This does not replace the independent acceptance seat above.
- **A request from Chemdawg counts the same as one from GDP** when it names the PR, the full SHA, and the stay-draft limits. A verdict never carries over to a new commit.
- **Neither reviews work it owns.**

### Golden Toad and Toad Venom: finding bugs

- Fixture-break sweeps run every day, all day, at :03 and :33 past the hour.
- Ranked FAILs go to GDP, who opens them as fix slices right away.
- Golden Toad uses only the cheekhimself fixture account, never the KEEP account (matt@). Toad Venom never signs in as the owner.
- Neither one publishes, runs APPLY, saves to the Action Queue, writes to the diary, or touches knk. HOLD #1250 applies to both.
- If the live build doesn't match the build being checked, the verdict is NOT_MEASURED. A network miss is not a product FAIL.
- If the fixture is signed out, a sweep stops with AUTH_NEEDED and does not try a saved password.

### Tie-breakers

| Item                                                     | Owner                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook creation, secret, receiver code                  | Codex                                                                                                                                              |
| Re-running or fixing a failed check                      | Codex                                                                                                                                              |
| Deciding that a failed check blocks a PR, and posting it | Chemdawg                                                                                                                                           |
| Pre-check rules and verdicts                             | Chemdawg                                                                                                                                           |
| Code that consumes pre-check verdicts                    | Codex                                                                                                                                              |
| Reviewer assignment and claim ledger                     | Chemdawg's pre-check, by file path (the 4.3 bot takes over when live); GDP can override                                                            |
| Review verdicts                                          | Independent acceptance: Blue Dream / Critical Mass by path, or independently assigned Durban Poison; Codex provides technical CI/build review only |
| Opening PRs                                              | Codex opens authorized repairs as drafts                                                                                                           |
| Merging PRs                                              | Chemdawg only, after 35/35 required SUCCESS and independent exact-head PASS; named holds remain                                                    |
| Edits to this file                                       | Codex                                                                                                                                              |
| Anything not listed                                      | GDP decides and adds a row here                                                                                                                    |

## 3. Standing locks (unchanged)

- **knk:** no production database access. This lock is Matthew's alone to lift.
- **HOLD #1250:** stays on hold. Never touch its branch `copilot/fix-migration-drift-issue` or any file in that PR's diff.
- **Untouchable drafts:** #1625, #1727, #1737, #1735, #1369. Nothing auto-assigns, merges, or edits them.
- **Off-limits without Matthew's explicit approval:** migrations/SQL, `supabase/`, RLS, auth, Edge functions, Action Queue, lockfiles, device control. A named GDP slice alone does not lift this fence.

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
  [PRECHECK] #N @sha READY | NOT READY (reason) | STALLED   (Chemdawg)
  [ROUTE]    #N @sha -> Blue Dream | Critical Mass (reason)   (bot / GDP)
  [CLAIM]    <reviewer> claims #N @sha
  [VERDICT]  <reviewer>: #N @sha PASS | PASS-with-P2 | FAIL | BLOCKED | NOT_MEASURED
  [MERGE]    #N @sha merged to <branch>             (Chemdawg)
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

- **Until this bot is live,** Chemdawg's pre-check assigns reviewers by hand with the same path rules (section 2).
- **Trigger.** CI is PASS on the exact SHA (4.1), and Chemdawg's `[PRECHECK]` says READY. A review-routing READY message does not mark a PR ready or authorize Codex to merge. Drafts remain draft; Chemdawg owns the final required-check and independent-PASS merge gate.
- **Rules, applied in order.**
  1. **Owner exclusion.** The author, host, and Codex's own PRs never go to that same party.
  2. **Blue Dream required** for P1 fixes, anything that gates a publish, and any `.tsx` file outside `src/test/`. Test-only `.tsx` changes do not override the Critical Mass default.
  3. **Critical Mass** for lib, logic, test, docs-only and other independent acceptance. **Codex** additionally supplies technical review for another author's CI/build infrastructure; it never accepts its own work or substitutes for a standing independent acceptance seat.
  4. **Load balance.** If the default reviewer has 2 or more open claims and the other has fewer, send it to the other one. P1 and publish-gating work never leaves Blue Dream. UI work never moves off Blue Dream for load balancing.
  5. **Critical Mass preference** for QA, accessibility, search, and content-quality PRs.

  Unknown priority counts as high and goes to Blue Dream.

  **HOLD-CHEEK holds the merge, not the review.** A HOLD-CHEEK PR still gets its independent review, the same as any other PR. That includes migration PRs, which are routed by path like any other PR. Only the merge waits for Matthew Cheek.

- **Claim ledger.** One row per PR and SHA: reviewer, time, and state (claimed, verdict, released). A new push releases the claim and re-routes the PR.
- **Conflicts.**
  - If both reviewers claim a PR, the first claim wins.
  - If a reviewer is silent for 60 minutes, non-Blue-Dream work moves to the other reviewer. Blue Dream-only work goes to Chemdawg's intake, and then to GDP.
  - If the two reviewers split, FAIL wins until GDP decides.
  - If CI is green but the pre-check says NOT READY, nothing is assigned.
- **Overrides** (GDP, posted in the channel): `REASSIGN #N to Blue Dream|Critical Mass`, `HOLD #N`, `RELEASE #N`. An override lasts for that SHA unless it says "sticky".
- **Next step fires on its own.** An exact-head `[VERDICT]` PASS or PASS-with-P2 (no P1) wakes Chemdawg, who makes the merge call under the section 5 gate (all required checks plus an independent exact-head PASS). A FAIL wakes the slice owner (Copilot or Codex) to push a fix. That new push starts the loop again at 4.1.
- **Never** assigns PRs on hold (a GDP `HOLD #N` override or HOLD #1250) or untouchable PRs. HOLD-CHEEK is different: it holds only the merge, so those PRs are still assigned.

### 4.4 Build order

1. Webhook, about 2 to 4 hours (estimate).
2. Routing integration: parser, tags, and digest. About 1 to 2 hours (estimate), since the channel itself is live.
3. Auto-assignment, about 4 to 8 hours (estimate).

Codex builds each one as a draft PR. Chemdawg owns merge after the exact-head
required-check and independent-PASS gate. An independent reviewer verdict is reported
only when actually obtained. Codex posts `[READY]` only when the connector is measured live.

## 5. The loop, end to end (no human step)

1. Toad sweep or grower report
2. GDP names a slice
3. Copilot or Codex opens a draft
4. `[CI]`
5. `[PRECHECK]`
6. `[ROUTE]` and `[CLAIM]`
7. `[VERDICT]`
8. Chemdawg merge call after 35/35 required checks and an independent exact-head PASS
9. `[MERGE]`
10. Next sweep

A FAIL at step 4 or step 7 goes back to step 3 automatically.

## 6. Self-starting handoffs

- **Repo only.** Every change to this file, the spec, or a connector lands as a commit in the repo, never as a local scratch file. If it isn't in the repo, it isn't decided. Agents point at `docs/agents/OWNERSHIP.md` instead of passing files around.
- **When this file or the connector spec changes on `verdant-grow-diary`:** a merge watcher posts `[SPEC]` in the routing channel, naming the next owner and action. GDP names the Codex slice without waiting on anyone.
- **When a connector PR merges:** the same watcher posts `[READY]` and wakes the next dependent build. Webhook live starts the routing integration; routing live starts auto-assignment; webhook live also retires the per-PR watch list.
- **When a new Copilot or Codex draft opens:** the watcher adds it to Chemdawg's pre-check intake, so no PR has to be added by hand.

## 7. Open items (owner in brackets)

- **O1: superseded by Matthew's current standing order.** The earlier proposed self-integration phases grant no current authority. Codex does not merge; Chemdawg owns merge only after 35/35 required checks and an independent exact-head PASS from Blue Dream, Durban Poison or Critical Mass.
- **O2 [Codex + Chemdawg]: review truth.** Codex cannot give its own code an independent PASS. Publish-gate acceptance and all named owner locks remain. Historical review receipts retain their original reviewer and SHA.
- **O3 [Matthew + Codex]: scoped identity.** The current connector acts as Matthew's admin account. Matthew creates a separate scoped identity and protections; Codex then measures allowed and refused operations. No permissions have been granted by the setup document, and code-owner review does not itself reject file pushes.
- **O4: settled.** Critical Mass and Toad Venom joined the routing channel on 2026-09-28. MotorBreath is on call outside it.
- **O5 [Matthew, spend]: Cursor cloud agent launches fail with a usage error.** This is a spend-ceiling item, so it stays with Matthew under section 1.

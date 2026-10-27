# Verdant ownership — single source of truth

**Pinned file.** This file is the one place to point at for who owns what in the Verdant engineering loop. `docs/agents/CURRENT_STATE.md` links here, and this file wins over `CURRENT_STATE.md`. `AGENTS.md` points here too, and this file wins over it on ownership and routing. Matthew Cheek's own words override both.

- **Repo:** `Verdant-OS/verdant-grow-diary`, deploy branch `verdant-grow-diary`
- **Owner of this file:** Codex. Any agent may propose an edit as a draft PR.
- **Last revised:** 2026-10-22, proposed bounded reviewer-routing correction approved by Matthew; historical Graft low-risk lane retained. Before that, 2026-09-28 by Chemdawg (Engineering Lead), at Matthew Cheek's request. First repo version edited by GDP for the channel roster, bug-finder limits, and merge ownership.

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

Ownership is temporary accountability, not permanent dibs. Keep one active implementation
writer per slice; review assignment grants no right to push or repair.

These are **role** owners: who merges, who reviews, who runs CI and connectors. They do
not make any task belong to one agent. The current holder may continue its open
task in `docs/agents/HANDOFF_LOG.md`; another agent may claim unclaimed work or a
claim stale for more than 24 hours after checking the latest state. Fresh claims,
explicit assignments and named path/PR locks are preserved. The merge and review
seats below still apply, and a claim never grants self-acceptance or merge authority.

### Codex: the repo, CI, builds, connectors, and CI/build reviews

- **Repo.** CI, builds and repository repairs. Matthew configures the separate scoped identity, branch rulesets and code-owner protections. Codex uses normal PR-branch pushes only: no force-push, merge, Publish, SQL apply or production Supabase writes. Drafts stay draft. Chemdawg merges only after 35/35 required checks succeed and an eligible independent reviewer session under §4.3 gives a clean PASS on the exact head SHA. Codex cannot be that reviewer on a PR Codex authored or repaired (for example #1938). Graft's exact-head PASS counts as that outside review on docs-only and low-risk PRs Graft did not author or repair (section 2). Production operations require Matthew's separate approval.
- **CI infrastructure.** Workflows, runners, check definitions, re-runs, and fixing flaky or broken checks.
- **Build pipelines.** Builds and deploy pipeline configuration, including making Vercel's Deployment Checks pass. There are no preview or staging targets. Promotion to production stays with the Vercel team owner, and the publish decision stays with Matthew (section 1).
- **The three connectors** (section 4). Codex builds, runs, and fixes them:
  - the CI status webhook
  - the routing channel with Grand Daddy Grok
  - reviewer routing to available eligible independent sessions (section 4.3)
- **Independent exact-head review.** Codex remains eligible for independent non-Codex-authored work that Codex did not repair. Non-contributing Claude or Grok review sessions may provide independent acceptance, including for Codex-authored work. Durban Poison remains eligible when actually available. Apply session, contributor-exclusion, scope and evidence checks in §4.3; role name or shared GitHub identity alone proves nothing.
  - An independent verdict on Codex's own work must come from an eligible non-contributing outside session. There is no author-integration exception; publish gates and named owner locks retain their fences (open item O2).
- **This file.** Codex keeps it current and accurate.

### Grand Daddy Grok (GDP): routing and product calls

- **Routing decisions.** Which slice runs next, which reviewer gets which PR, overrides, and holds.
- **Slice naming.** GDP routes priorities and named slices. Codex may start authorized repository repairs and resume a claimed handoff without waiting for another GDP paste. One task uses one branch and one current holder.
- **Opening PRs.** GDP routes work; Codex builds authorized repairs as drafts. Chemdawg owns merge under the current exact-head gate below.
- **Merge rule (Matthew's current standing order).** Chemdawg merges only after 35/35 required checks succeed and a clean PASS from an eligible independent reviewer session under §4.3 covers the exact head SHA. Codex cannot give that PASS on a PR Codex authored or repaired (for example #1938). Graft's exact-head PASS counts as the outside review on docs-only and low-risk PRs Graft did not author or repair (section 2). Missing, skipped, pending or failed required checks are not green. P1 and publish gates retain their assigned review and hold fences.
- **Spend proposals.** GDP writes the proposal. Approval stays with Matthew.

### Chemdawg (Engineering Lead): pre-checks, CI status, and reviewer assignment

- **Pre-checks.** On every PR head, Chemdawg checks scope, the closed file plan, tests, and that CI is finished.
- **Verdict format.** Three lines, posted in the routing channel:
  - the PR URL
  - the full head SHA
  - `READY → <reviewer>`, `NOT READY (reason)`, or `STALLED`.
- **Reviewer assignment (Matthew, 2026-09-28 ~5:03 PM CT).** When a draft's CI settles green on real files, Chemdawg selects an actually available eligible independent session for the whole file scope (section 4.3), posts `READY → <reviewer>` to GDP, and sends the review request straight to that reviewer: PR URL, full SHA, stay draft, no merge, no publish. PRs that touch off-limits paths, migrations included, are still routed by path for review. Chemdawg holds only their merge for Matthew (HOLD-CHEEK, section 4.3).
- **CI chasing.** Chemdawg follows pending and failed heads and flags stalls. Chemdawg does not re-run or fix CI.
- **Intake of unplaceable PRs.** When no routing rule matches, or a reviewer goes silent, Chemdawg picks it up and reports it.

### Available independent reviewer sessions

- **Blue Dream and Critical Mass are retired from future routing.** Historical receipts retain the reviewer, exact SHA, scope and verdict originally recorded. Do not erase or rename them.
- **One verdict per exact SHA:** `PASS`, `PASS-with-P2`, `FAIL`, `BLOCKED`, or `NOT_MEASURED`, with a list of P1 and P2 issues. Only PASS with zero P1 and zero P2 meets acceptance.
- Select a session actually available and able to review the complete scope, including `.tsx`/UI, lib/logic, tests, docs, QA, accessibility, search, CI or build as applicable. An unverified roster entry is not availability evidence. Unknown priority is treated as high risk for review and evidence requirements.
- Codex is eligible only on work Codex neither authored nor repaired. Non-contributing Claude or Grok review sessions may give independent acceptance, including for Codex-authored work. Durban Poison remains eligible when actually available. Exclude all authors and repairers even after claim transfer; do not erase prior contributions.
- Record reviewer session and role, all contributor exclusions and how checked, full 40-character head SHA, complete scope, required CI and supplemental evidence, and verdict permalink. A shared GitHub account is not evidence of independent sessions by itself. If independence or scope coverage cannot be verified, BLOCKED.
- **Graft low-risk lane (Matthew, 2026-10-09 11:29 PM CT; outside-review count Matthew via Verdo, 2026-10-10 1:54 AM CT).** On a docs-only or other low-risk PR that Graft did not author or repair, Graft's exact-head PASS counts as the outside review. Low-risk, including a docs-only PR, means **every** changed file is on this allowlist and `node scripts/scorer-lock.mjs --report --strict` reports no tracked scorer modified, deleted, renamed or retyped:
  - ordinary docs: `*.md` under `docs/`, except anything under `docs/agents/` other than `docs/agents/HANDOFF_LOG.md`;
  - `docs/agents/HANDOFF_LOG.md` (handoff-log-only PRs);
  - tests: new files under `src/test/` or `e2e/`, or new files named `*.test.*` / `*.spec.*`. Every tracked test is a locked scorer, so editing, deleting or renaming an existing test needs an outside reviewer.

  Draft and backlog cleanup with no file change (closing a stale draft, refreshing a PR body) is also in the lane. Governance files are **not** docs-only and **not** low-risk, because editing them changes the rules: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.grok/`, `.agents/skills/`, `.claude/skills/`, `.github/` and everything under `docs/agents/` except `HANDOFF_LOG.md`. **Outside reviewers:** governance and protected scopes require an actually available, eligible independent session under §4.3. Migrations, payments or billing, workflows (`.github`), security or auth, and dependency or lockfile changes retain their supplemental evidence and protected-file gates. The same outside reviewer stays required for `supabase/`, Edge Functions, production config, the Action Queue, device control, a locked scorer, and any PR that mixes allowlisted files with any other file. Graft's PASS covers only the exact head SHA it names and is void once the head moves. This lane changes who may review; it does not change who may merge.

- **Codex remains an equal independent exact-head reviewer** for non-Codex-authored work Codex did not repair. An available non-contributing Claude/Grok review session can accept Codex-authored work. A request or acknowledgment never counts as a verdict.
- **A request from Chemdawg counts the same as one from GDP** when it names the PR, full SHA, reviewer session/role, contributor exclusions, complete scope and stay-draft limits. Check existing requests and receipts before sending it. A verdict never carries over to a new commit.
- **No contributor accepts its own work.** See §4.3 for the single-request ledger and unavailable-reviewer transfer.

### Golden Toad and Toad Venom: finding bugs

- Fixture-break sweeps run every day, all day, at :03 and :33 past the hour.
- Ranked FAILs go to GDP, who opens them as fix slices right away.
- Golden Toad uses only the cheekhimself fixture account, never the KEEP account (matt@). Toad Venom never signs in as the owner.
- Neither one publishes, runs APPLY, saves to the Action Queue, writes to the diary, or touches knk. HOLD #1250 applies to both.
- If the live build doesn't match the build being checked, the verdict is NOT_MEASURED. A network miss is not a product FAIL.
- If the fixture is signed out, a sweep stops with AUTH_NEEDED and does not try a saved password.

### Tie-breakers

| Item                                                     | Owner                                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook creation, secret, receiver code                  | Codex                                                                                                                                                |
| Re-running or fixing a failed check                      | Codex                                                                                                                                                |
| Deciding that a failed check blocks a PR, and posting it | Chemdawg                                                                                                                                             |
| Pre-check rules and verdicts                             | Chemdawg                                                                                                                                             |
| Code that consumes pre-check verdicts                    | Codex                                                                                                                                                |
| Reviewer assignment and claim ledger                     | Chemdawg's pre-check under §4.3; GDP can route within the same independence and evidence gates                                                       |
| Review verdicts                                          | Available eligible independent session under §4.3; Codex excluded on Codex-authored/repaired work; Graft only within the existing low-risk allowlist |
| Opening PRs                                              | Codex opens authorized repairs as drafts                                                                                                             |
| Merging PRs                                              | Chemdawg only, after 35/35 required SUCCESS and independent exact-head PASS; named holds remain                                                      |
| Edits to this file                                       | Codex                                                                                                                                                |
| Anything not listed                                      | GDP decides and adds a row here                                                                                                                      |

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
- **Historical membership receipt (2026-09-28).** GDP, Chemdawg, Blue Dream, Golden Toad, Critical Mass, and Toad Venom (six, the channel maximum). MotorBreath stays on call outside the channel for CI command packs. Matthew reads the channel, and nothing in it waits on him. This historical receipt is not a current reviewer-availability registry. Blue Dream and Critical Mass are retired from future routing. No channel membership is changed here.
- **Post tags.** Every post names the PR and the full SHA:
  ```
  [CI]       #N @sha PASS|FAIL                      (webhook)
  [PRECHECK] #N @sha READY | NOT READY (reason) | STALLED   (Chemdawg)
  [ROUTE]    #N @sha -> <eligible reviewer session/role> (scope, exclusions, reason)   (bot / GDP)
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
  - `[ROUTE]` names an actually available, eligible independent session under §4.3, with role and contributor exclusions. Codex is excluded on Codex-authored or repaired work; Graft retains only its existing low-risk allowlist.
  - Reply only when it adds something.
  - A new head supersedes its review request/claim and invalidates the old verdict; it does not release the implementation writer's claim.
  - No secrets or production data in the channel.
- **Digest.** GDP posts an end-of-day digest. Only `[ESCALATE]` lines notify Matthew right away.

### 4.3 Available reviewer routing and request ledger (Codex)

This corrects routing instructions only; it does not install or change runtime automation,
hooks, channel membership, GitHub settings or existing assignments.

- **Preconditions.** Chemdawg's pre-check still requires CI PASS at the full head SHA and READY for review. READY for review does not mark the PR ready or grant merge authority. Drafts remain draft. The existing merge actor, merge queue, exact-head guard, 35/35 required checks, supplemental evidence, no-P1/P2 rule, protected-file gates, holds and founder-only production controls remain.
- **Eligibility, applied before routing.** Check actual availability, complete scope coverage and independence. Exclude every author and repairer, regardless of later ownership transfer. Codex cannot accept Codex-authored or repaired work. Non-contributing Claude/Grok review sessions may accept Codex-authored work; available Durban Poison remains eligible. Graft retains exactly the section 2 low-risk allowlist; governance, protected or mixed PRs need an eligible outside reviewer. Blue Dream and Critical Mass receive no future requests. Named holds and explicit assignments remain binding; this policy does not reassign a held task.
- **One current request per PR/full head.** Before any ping, inspect the current full head, existing request and receipt. Preserve an independent PASS that is still valid for that head and its review conditions; do not issue a duplicate request. Keep one canonical ledger entry for each PR/full head with request owner, reviewer session/role, contributor exclusions and how verified, complete scope, evidence, request/receipt permalinks, timestamps, fallback-transfer count and state: `requested`, `running`, `blocked`, `verdict`, or `superseded`. Acknowledgments, pending requests and silence are not PASS. Do not invent a permalink for an unsent packet; mark delivery BLOCKED if the authorized transport is unavailable.
- **Unavailable reviewer.** If the assigned session declines, is unavailable, or has been silent for 60 minutes, the request owner records the reason, supersedes that assignment and transfers the existing request once to one actually available eligible fallback. Recheck head and contributor exclusions before transfer. Never keep parallel active requests or repeatedly ping a retired/unavailable seat. If no eligible fallback is available, or the fallback is unavailable, record `blocked`, its owner and the exact missing evidence. Silence never becomes approval or task ownership.
- **New head and re-review.** A new head makes the old request `superseded` and invalidates its verdict. Record the replacement full SHA and obtain a full re-review of that head, including required supplemental evidence. This does not release the implementation writer's claim. Keep old receipts as history. Relevant base, scope, description, checks or hold changes also trigger the review skill's re-review rules.
- **Review claims and verdicts.** Only one reviewer assignment is active for the current head. A conflict or unverified independence is BLOCKED; an unresolved P1 or P2 goes back to the implementation writer. Any adverse verdict remains blocking until its findings are resolved; transferring reviewers never discards findings. PASS-with-P2 is never merge acceptance. A clean independent exact-head PASS proceeds only through existing merge/evidence/hold gates.
- **Implementation claim/release safeguards.** Ownership is temporary accountability, not permanent dibs. Keep one active implementation writer under AGENTS.md's coverage rules. Read effective PR claims/releases and the deploy-branch handoff block before taking work; preserve fresh claims, explicit assignments and named locks. The holder stops pushing before `released_by:`; the successor claims, re-reads for a winning earlier claim and verifies the full remote head before continuing on the same branch. Review fallback transfers no implementation assignment. Existing comment-approval gates still apply; without authorized claim/release transport, record BLOCKED rather than assuming a transfer.
- **Holds.** HOLD-CHEEK still holds the merge, not the review. Never assign PRs on hold (a GDP `HOLD #N` override or HOLD #1250) or untouchable PRs. HOLD-CHEEK is the existing exception: it holds only the merge, so review may proceed. All protected paths remain untouched. No review receipt authorizes production, SQL, publish, spend, security/settings or secrets changes.

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

- **O1: superseded by Matthew's current standing order.** The earlier proposed self-integration phases grant no current authority. Codex does not merge; Chemdawg owns merge only after 35/35 required checks and a clean independent exact-head PASS from an eligible session under §4.3 (Codex excluded on Codex-authored/repaired work). Graft's exact-head PASS counts as the outside review on section 2 docs-only and low-risk PRs Graft did not author or repair.
- **O2 [Codex + Chemdawg]: review truth.** Codex cannot give its own code, or a PR Codex repaired, an independent PASS (for example #1938). Publish-gate acceptance and all named owner locks remain. Historical review receipts retain their original reviewer and SHA.
- **O3 [Matthew + Codex]: scoped identity.** The current connector acts as Matthew's admin account. Matthew creates a separate scoped identity and protections; Codex then measures allowed and refused operations. No permissions have been granted by the setup document, and code-owner review does not itself reject file pushes.
- **O4: historical receipt.** Critical Mass and Toad Venom joined the routing channel on 2026-09-28. MotorBreath is on call outside it. This historical receipt does not establish present availability or route future work to Critical Mass.
- **O5 [Matthew, spend]: Cursor cloud agent launches fail with a usage error.** This is a spend-ceiling item, so it stays with Matthew under section 1.

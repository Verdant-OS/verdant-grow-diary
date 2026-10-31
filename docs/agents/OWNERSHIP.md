# Verdant ownership — single source of truth

**Pinned file.** This file is the one place to point at for who owns what in the Verdant engineering loop. `docs/agents/CURRENT_STATE.md` links here, and this file wins over `CURRENT_STATE.md`. `AGENTS.md` points here too, and this file wins over it on ownership and routing. Matthew Cheek's own words override both.

- **Repo:** `Verdant-OS/verdant-grow-diary`, deploy branch `verdant-grow-diary`

**Historical — no current seat.** The next two lines are the prior named-owner text, kept word for word.

<!-- prettier-ignore -->
- **Owner of this file:** Codex. Any agent may propose an edit as a draft PR.
- **Last revised:** 2026-10-26, Matthew's latest PR #1971 assignment recorded: OG Kush merges, Jack Herer independently accepts, Codex is repair-only; the earlier Codex exception is superseded and the explicit merge hold remains. The 2026-10-22 bounded reviewer-routing correction and historical Graft low-risk lane remain. Before that, 2026-09-28 by Chemdawg (Engineering Lead), at Matthew Cheek's request. First repo version edited by GDP for the channel roster, bug-finder limits, and merge ownership.

---

## Current seats

Governance docs define seats and duties. `docs/agents/constitution/roster.md` is the only file mapping seats to current agent names and GitHub accounts, and on who holds a seat the roster wins. Matthew's own words override both. Renaming an agent edits only the roster.

Comms tags are PR comments. The PR thread is the ledger. Slack pings never count. The protocol is not stored in this repository.

| Duty                                                   | Seat                  | Backup         |
| ------------------------------------------------------ | --------------------- | -------------- |
| Pre-check and CI chasing                               | Merge Readiness       | Coordinator    |
| Routing, `[ROUTE]` / `[ACK]` / `[FALLBACK]`, intake    | Coordinator           | Steward Backup |
| Review-ready transition                                | Coordinator           | Steward Backup |
| Enqueue, merge, and post-merge `[LIVE]` reconciliation | Merge Steward (Ultra) | Steward Backup |
| QA and `[VERIFY]`                                      | QA                    |                |
| New-user smoke, on request after the deploy ping       | New-User Smoke        |                |
| Bug sweep, file only                                   | Bug Sweep             |                |
| Per-item approval, gated paths, exceptions             | Matthew only          |                |

Ultra Builder 1, Ultra Builder 2, and Ultra Fixer write. They never approve, mark ready, enqueue, or merge. The Merge Steward is an Ultra seat that merges only after a non-author Reviewer seat APPROVES the exact head. The account is named only in the roster. The Merge Steward has no authority over the PR #1971 hold, which stays with the Coordinator.

Reviewer C, Reviewer D, and QA are active. Holders are named only in the roster.

**Review-ready.** The Builder posts `READY FOR REVIEW <full-sha>`. The Coordinator then marks the PR ready if it touches no gated path, or after Matthew's yes if it does. That starts the full 35 checks. Review-ready is not merge approval. Skipped, missing, or neutral checks are `NOT_MEASURED`, never a pass. Full CI on drafts was not chosen.

**Four-state review record.** All of these are PR comments:

1. `[ROUTE] #N @<sha> → Reviewer X; excl: <contributor seats>; scope: <files>` (Coordinator; proves only that it was recorded).
2. `[ACK]` (Coordinator, once delivery is confirmed or the reviewer replies). No ack in 15 minutes means delivery failed: resend once, then unavailable.
3. `[CLAIM] Reviewer X @<sha>` (reviewer seat). First claim at the current sha wins; one reviewer per sha.
4. Verdict: a GitHub review at `commit_id` = sha, body carrying seat, session, independence, scope, and P1/P2.

Fallback is run by hand by the Coordinator. No automation is claimed. 60 minutes after `[ROUTE]` with no `[CLAIM]`: post `[WITHDRAWN]` for the first reviewer and `[FALLBACK 1] → Reviewer Y`. If that also misses, one question to Matthew. Late verdicts from a withdrawn reviewer are recorded and do not count; adverse ones are raised to the active reviewer and Matthew. A new head resets every state and goes to a different reviewer seat.

**Verdict types.**

- Adverse (`FAIL`, any P1 or P2) is `REQUEST_CHANGES`, never `COMMENT`.
- Clean (0 P1 / 0 P2) on a non-gated PR is `APPROVE` at the exact commit, posted by the reviewer seat without asking Matthew.
- Clean on a gated PR is `COMMENT`. `APPROVE` only after Matthew's own yes naming the PR and SHA.
- Only the Merge Steward may dismiss a `REQUEST_CHANGES`, and only with Matthew's written exception naming the PR, SHA, and finding, linked in the dismissal message.
- Open findings stay open until each is fixed at a sha or waived by Matthew in writing.

**Merge Steward.** Queues only with `gh pr merge <N> --auto --match-head-commit <full-sha>`, and only with: 35/35 required checks at that sha; a clean `APPROVE` from a non-contributing Reviewer seat at the current head (an approval from the Ultra account named in the roster never counts); a hard head re-check (`|| exit 1`) right before queueing; no conflicts; any gated `[BLOCKED-ON-MATTHEW]` cleared by Matthew; holds respected (#2532 and #2535 are never re-enqueued; #2539, #2526, #2231, #2536, and #2640 are held; #2593 and #2594 only after #2592). The Steward session never queues a PR it wrote, fixed, or base-merged. Builder and Fixer seats never approve, mark ready, enqueue, or merge. The Merge Steward has no authority over the PR #1971 hold, which stays with the Coordinator.

**Enforced by GitHub vs by agents.** Live ruleset `24445196`, the 35-check union, and the queue settings were not re-read for this change (`NOT_MEASURED`).

- GitHub, as recorded for agents to follow until a live read replaces it: required checks are the union of classic protection and ruleset 24445196 (currently 35); merge queue (`MERGE`, `ALLGREEN`, 360-minute timeout); 1 approving review; stale approvals dismissed on push; last-push approval; enforce admins. The own-PR rule applies to the PR author, not commit authors.
- Agents: reviewer independence, Matthew's per-item yes, protected paths, scorer lock, holds, mark-ready, and the Steward's preconditions.
- Pending or deferred: `CODEOWNERS`, required scorer-lock and sentinel checks (sentinel needs the follow-up workflow PR), and branch push restrictions (deferred by Matthew).
- Only Reviewer seats' verdicts count as acceptance. Bot reviews (CodeRabbit, Cursor, Copilot, GitHub Advanced Security) are advisory input the reviewer must consider. CodeRabbit stays on.

**After merge, not on a clock.** The `:03` / `:33` sweep schedule is not current. New-User Smoke runs when asked, after the deploy ping. Bug Sweep files findings only. QA posts `[VERIFY]`. The Coordinator routes a FAIL to a Builder or Fixer seat.

**Loop that replaces the historical steps 8–10.** Merge Readiness confirms 35/35 at the exact head. The Merge Steward queues with the command above after a non-author Reviewer `APPROVE`. QA, New-User Smoke, and Bug Sweep follow merge, on request or by filing.

**Handoff guard.** Any active assignment or hold owned by a historical agent stays in force until an explicit Coordinator handoff or Matthew's release (he released Codex's work on 2026-10-30).

## Historical named owners

The sections below are the prior named-owner text, kept word for word. They do not assign a current seat. The PR #1971 hold in this file stays in force. The Merge Steward has no authority over that hold.

## 1. The one rule about Matthew

Routine review work proceeds without waiting on Matthew. His current approval
gates remain binding.

- Research, implementation within an existing assignment, testing and review do not
  wait for Matthew to relay work.
- Merges and the other per-item actions follow section 2 and the roster. When an
  approval is absent, record the item under section 7; do not bypass the gate.

Historical receipt (2026-09-28, 4:34 PM CT): the standing order then reserved the
four decisions below. They remain reserved. The later per-item approval policy in
section 2 and the roster adds merge and other action gates; this dated receipt does
not override them:

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

### Merge approval and conditional backup

Every merge requires Matthew's per-item yes at the exact head SHA, as well as the
required CI, independent review, queue and hold gates. Green checks and a PASS
establish eligibility, not merge approval. Matthew's current explicit assignment
defines the actor. Chemdawg/Grok 91 is retired; Harvest does not inherit PR #1971.
See the named assignment below and [the roster](constitution/roster.md#pr-1971-merge-actor-assignment-and-hold).
Existing explicit founder grants keep their recorded scope. Approval actions and
low-risk exceptions are listed in [the roster](constitution/roster.md#per-item-approval).

### PR 1971 merge actor assignment and hold

Matthew's latest direct instruction is: **OG Kush merges #1971, Jack Herer
gives the independent PASS, and Codex is repair-only.** This supersedes the earlier
Codex merge-actor assignment and removes its author-integration exception for
PR #1971. Codex repairs, validates, pushes normally and prepares evidence within
the assigned scope; Codex must not mark ready, enqueue, enable auto-merge or merge
#1971. This creates no broader grant and changes no separately recorded founder
grant. Chemdawg/Grok 91 is retired; Harvest does not inherit this assignment.
Historical profiles and older default routing do not assign this PR.

**Merge and deployment remain held.** Matthew authorized this documentation
correction, ordinary push and fresh CI, and explicitly said **do not merge or
deploy yet**. Only OG Kush may later ready/enqueue, after Matthew explicitly lifts
the hold and gives his per-item yes at the final reviewed full 40-character head
SHA, with every gate below satisfied. Actor assignment is not that approval.

At the same unchanged head require all 35 required contexts and applicable
supplemental checks successful; Jack Herer's complete-scope clean PASS with zero
P1/P2; actual eligible outside session and role, verified contributor exclusions
and a durable review receipt; no blocking finding/HOLD/scorer-lock issue/draft/
conflict; and the normal merge queue with expectedHeadOid pinned. Naming Jack
Herer proves neither availability nor acceptance; shared GitHub identity alone
proves no independence. OG Kush's merge/pre-check role does not supply that PASS.
Every contributing Codex session and subagent remains excluded from acceptance.
A new head needs fresh CI, complete review and same-head founder approval.
No production or deployment authority is granted. This section and the
[matching roster assignment](constitution/roster.md#pr-1971-merge-actor-assignment-and-hold)
control older actor/routing text below for PR #1971.

### Codex: the repo, CI, builds, connectors, and CI/build reviews

- **Repo.** CI, builds and repository repairs. Matthew configures the separate scoped identity, branch rulesets and code-owner protections. Codex uses normal PR-branch pushes: no force-push, Publish, SQL apply or production Supabase writes. For PR #1971, Codex is repair-only and cannot ready, enqueue, enable auto-merge or merge; OG Kush is the assigned actor under the hold above. Other explicit founder grants retain their separately recorded scope; no default authority is created. Drafts stay draft until an authorized ready/enqueue step. The assigned merge actor needs 35/35 required checks, applicable supplemental evidence and an eligible independent full-head clean PASS under §4.3. Codex cannot supply that PASS on work it authored or repaired (for example #1938). Graft's outside-review lane remains section 2's docs-only/low-risk allowlist. Production operations require Matthew's separate approval.
- **CI infrastructure.** Workflows, runners, check definitions, re-runs, and fixing flaky or broken checks.
- **Build pipelines.** Builds and deployment pipeline configuration. Production runs on Cloudflare Workers at https://verdantgrowdiary.com. Vercel checks do not establish a production release. There are no preview or staging targets. Production publishing stays with the hosting owner, and the publish decision stays with Matthew (section 1).
- **The three connectors** (section 4). Codex builds, runs, and fixes them:
  - the CI status webhook
  - the routing channel with Grand Daddy Grok
  - reviewer routing to available eligible independent sessions (section 4.3)
- **Independent exact-head review.** Codex remains eligible for independent non-Codex-authored work that Codex did not repair. Non-contributing Claude or Grok review sessions may provide independent acceptance, including for Codex-authored work. Durban Poison remains eligible when actually available. Apply session, contributor-exclusion, scope and evidence checks in §4.3; role name or shared GitHub identity alone proves nothing.
  - An independent verdict on Codex's own work must come from an eligible non-contributing outside session. PR #1971 assigns OG Kush to merge, Jack Herer to independent acceptance and Codex to repairs only; it grants Codex no author-integration exception. Publish gates and named owner locks retain their fences (open item O2).
- **This file.** Codex keeps it current and accurate.

### Grand Daddy Grok (GDP): routing and product calls

- **Routing decisions.** Which slice runs next, which reviewer gets which PR, overrides, and holds.
- **Slice naming.** GDP routes priorities and named slices. Codex may start authorized repository repairs and resume a claimed handoff without waiting for another GDP paste. One task uses one branch and one current holder.
- **Opening PRs.** Codex builds authorized repairs as drafts. Merge ownership follows Matthew's current explicit assignment, including the held PR #1971 OG Kush / Jack Herer assignment above; do not route new work to retired Chemdawg/Grok 91.
- **Merge rule (Matthew's current standing order).** The assigned actor merges only after per-item approval, 35/35 required checks, applicable supplemental evidence and a clean complete-scope PASS from an eligible independent session under §4.3 at the same full head. Codex cannot give that PASS on a PR it authored or repaired (for example #1938). Graft's outside-review lane remains limited to section 2. Missing, skipped, pending, cancelled or failed required checks are not green. Every explicit merge/publish hold remains, including PR #1971's current no-merge hold.
- **Spend proposals.** GDP writes the proposal. Approval stays with Matthew.

### Chemdawg: historical pre-check, CI-status and reviewer-assignment profile

Chemdawg/Grok 91 is retired from current routing. The following earlier role
description is preserved as history; it cannot assign or merge PR #1971. Its
current actor, reviewer, repair-only role and hold are the named assignment above.

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

<!-- prettier-ignore -->
| Item                                                     | Owner                                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook creation, secret, receiver code                  | Codex                                                                                                                                                |
| Re-running or fixing a failed check                      | Codex                                                                                                                                                |
| Deciding that a failed check blocks a PR, and posting it | Chemdawg                                                                                                                                             |
| Pre-check rules and verdicts                             | Chemdawg                                                                                                                                             |
| Code that consumes pre-check verdicts                    | Codex                                                                                                                                                |
| Reviewer assignment and claim ledger                     | Chemdawg's pre-check under §4.3; GDP can route within the same independence and evidence gates                                                       |
| Review verdicts                                          | Available eligible independent session under §4.3; Codex excluded on Codex-authored/repaired work; Graft only within the existing low-risk allowlist |
| Opening PRs                                              | Any agent with repository access may open its own authorized draft PR                                                                                                             |
| Merging PRs                                              | Matthew's current explicit actor assignment; PR #1971 assigns OG Kush to merge and Jack Herer to independent acceptance, with Codex repair-only; merge remains held. Per-item exact-head approval, 35/35 required SUCCESS, applicable supplemental checks and an eligible independent full-head PASS remain required. |
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

Codex builds each one as a draft PR. Matthew's current explicit actor assignment
controls merge after the exact-head approval, required-check and independent-PASS
gate; PR #1971 remains held, with OG Kush assigned to merge and Codex repair-only. An independent reviewer verdict is reported
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

- **O1: superseded by Matthew's current standing order.** Earlier proposed self-integration phases grant no current authority. PR #1971 assigns OG Kush to merge, Jack Herer to independent acceptance and Codex to repairs only, superseding the earlier Codex exception. Codex cannot integrate #1971. Other explicit founder grants retain their separately recorded scope. Every authorized merge still needs 35/35 required checks, applicable supplemental gates and a clean eligible independent full-head PASS under §4.3 (Codex excluded on Codex-authored/repaired work). The current #1971 hold and later same-head founder approval remain required. Graft's outside-review lane remains limited to section 2 docs-only and low-risk work Graft did not author or repair.
- **O2 [Codex + Chemdawg]: review truth.** Codex cannot give its own code, or a PR Codex repaired, an independent PASS (for example #1938). Publish-gate acceptance and all named owner locks remain. Historical review receipts retain their original reviewer and SHA.
- **O3 [Matthew + Codex]: scoped identity.** The current connector acts as Matthew's admin account. Matthew creates a separate scoped identity and protections; Codex then measures allowed and refused operations. No permissions have been granted by the setup document, and code-owner review does not itself reject file pushes.
- **O4: historical receipt.** Critical Mass and Toad Venom joined the routing channel on 2026-09-28. MotorBreath is on call outside it. This historical receipt does not establish present availability or route future work to Critical Mass.
- **O5 [Matthew, spend]: Cursor cloud agent launches fail with a usage error.** This is a spend-ceiling item, so it stays with Matthew under section 1.

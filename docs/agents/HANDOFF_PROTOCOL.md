# Verdant Agent Handoff Protocol

**Sentinel-Version: 2026-10-31.1**

## Current seats

Governance docs define seats and duties. `docs/agents/constitution/roster.md` is the only file mapping seats to current agent names and GitHub accounts, and on who holds a seat the roster wins. Matthew's own words override both. Renaming an agent edits only the roster.

Writers are Ultra Builder 1, Ultra Builder 2, and Ultra Fixer. They never approve, mark ready, enqueue, or merge. The Merge Steward is the only seat that queues or merges, and only after a non-author Reviewer seat APPROVES the exact head. The Coordinator routes. Reviewer A, B, C, and D give exact-head verdicts. Reviewer C, Reviewer D, and QA are active. Holders are named only in the roster. QA, New-User Smoke, and Bug Sweep run after merge. Matthew alone gives per-item approval. The Merge Steward has no authority over the PR #1971 hold, which stays with the Coordinator.

Handoff guard: any active assignment or hold owned by a historical agent stays in force until an explicit Coordinator handoff or Matthew's release (he released Codex's work on 2026-10-30).

Preferred path (not rank):

```text
Ultra Builder 1 or 2    write
  -> Coordinator        route
  -> Reviewer A/B/C/D   exact-head verdict
  -> QA                 audit
  -> Matthew            approve what ships
```

Comms tags are PR comments. The protocol is not stored in this repository.

Operating order is sequential for a given slice. Parallel implementation of the **same**
slice by multiple agents is the failure this protocol exists to prevent.

## Historical peers

**Peers (Cheek, 2026-08-20, refined):** Codex, Claude, and Grok have equal authority.
None outranks the others. Explicit assignments, named locks and the current coverage
claim control who researches, architects,
implements, audits, tests, or independently reviews. Default strengths differ (Grok:
product intelligence / adversarial audit / implementation; Claude: specs & knowledge
architecture; Codex: often build / integration) — preference, not exclusivity. Peer
rules do **not** erase collision fences (Tranche A remaining edit points = Codex until
reassigned; Tranche B+ product code = Claude until reassigned; no competing Timeline /
Alerts / Action Queue rewrite).

### Claim + independent reviewer (standing rule)

Tasks are not owned by agents. Every open task has a coverage block in
`docs/agents/HANDOFF_LOG.md` (see `AGENTS.md`, Agent Handoff / Coverage), and any agent
may resume an open block (as `AGENTS.md` defines it: a pushed branch and a PR, with no
effective claim or a last activity older than 24 hours) after posting a
`claimed_by` claim comment on the task's PR (see `AGENTS.md`).
Keep explicit assignments and named locks; a fresh claim is not available for takeover.
Every slice names:

1. **The current claim**: the agent building it now, the effective claim under `AGENTS.md`
   (the newest valid claim, in the log or in a claim comment on the task's PR)
2. **One independent reviewer**: an agent that has not touched the slice

No agent that contributed to a slice can give its independent acceptance PASS.
Contributors may provide peer observations, which do not replace independent acceptance.
Use the HANDOFF block below for a deliberate
transfer between roles; use the log block for day-to-day coverage. In a deliberate
transfer the current holder first posts a `released_by: <agent>, <YYYY-MM-DD HH:MM> UTC
to <successor>` comment on the PR (see `AGENTS.md`), and the successor then claims. Keep the same branch,
confirm its remote head, and merge from base; never rename, recreate or force-push it.

Independent acceptance routing: the Coordinator selects an actually available Reviewer seat (A, B, C, or D) for the complete scope under `docs/agents/OWNERSHIP.md` §4.3.
**Critical Mass is retired from future routing**; preserve historical receipts. Reviewer C, Reviewer D, and QA are active. Holders are named only in the roster.
Exclude every author and repairer even after a task transfer. A shared GitHub identity
alone does not establish independence: record session, role, contributor exclusions,
full 40-character head SHA, complete scope, evidence and verdict.
The Merge Steward's gate still requires **35/35 required checks** and an independent
**PASS at the exact head SHA**, with no P1 or P2. **Graft** retains only its existing
OWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,
protected or mixed scopes still need an eligible outside reviewer. Required CI and
supplemental evidence, protected-file gates, holds, merge queue and founder-only
production controls remain. Builder and Fixer seats use normal pushes only: no force-push, merge,
Publish, SQL apply or production Supabase writes. Drafts remain draft.
The Merge Steward has no authority over the PR #1971 hold.
Check the existing request and receipt before pinging; keep one current review request
per PR/full head with owner, permalink and requested/running/blocked/verdict/superseded
state. Transfer an unavailable reviewer once to an eligible fallback; otherwise record
BLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence
are not PASS. Preserve a still-valid independent review without a duplicate request.

Record the acceptance seat, exact reviewed head and completed/NOT_MEASURED
review state in the handoff.

Historical preferred path, kept word for word:

Preferred research → architecture → build path (not rank; any peer may own any stage
when assigned):

```text
Grok      product intelligence, research, live-app audit, implement, test, independent review
  -> Claude    architecture / specs (and any peer power when holding the slice)
  -> Codex     build / integration (often; not exclusive) + peer powers when holding
  -> QA        independently audit quality, scope, trust boundaries, evidence and safety
  -> Cheek     approve what ships
```

An agent may hand _back_ (returning work as under-specified or unsafe) at any point. An
agent may not hand _forward_ past its successor on the preferred path, except when
`CURRENT_STATE.md` already names a different peer as the next holder or independent
reviewer.

---

## Standard handoff format

Every handoff carries this block. A handoff without it is incomplete and the receiving
agent should return it rather than guess.

```text
HANDOFF
from_agent:
to_agent:
sentinel_version:
date:

task_id:
independent_reviewer: actually available eligible session under OWNERSHIP.md §4.3; name session and role, not only GitHub identity
contributor_exclusions: every author and repairer seat; a contributing seat cannot accept the same PR
review_head_sha: full 40-character SHA
review_scope: complete changed scope and required supplemental evidence
review_request: owner; permalink; requested/running/blocked/verdict/superseded; fallback transfer count
review_verdict: PASS/PASS-with-P2/FAIL/BLOCKED/NOT_MEASURED, with evidence permalink
claimed_by:
last_updated:

completed:
  - what was actually done, not what was attempted

verified_by:
  - the specific evidence, command, or artifact that proves it
  - state the ref/branch/commit audited

not_done:
  - explicitly out of scope, or attempted and blocked

unknowns:
  - questions the receiving agent must not assume answers to

blocked:
  - blocker, owner, and what would unblock it

assumptions:
  - anything inferred rather than verified, and what breaks if it is wrong

next_slice:
  - the single smallest next action, with its owner

files_touched:
  - paths, or "none"
```

The current holder and acceptance reviewer must be independent; changing the claim
does not erase earlier contributions. Record the Reviewer seat assigned under
`docs/agents/OWNERSHIP.md` §4.3 (Merge Readiness confirms the checks; the Coordinator routes).
Choose an actually available Reviewer seat for the complete scope. Reviewer C, Reviewer D,
and QA are active. Critical Mass is retired from future routing. Graft retains only its existing low-risk
allowlist; governance, protected and mixed scopes require an eligible outside reviewer.
Keep all supplemental evidence and protected-file gates. QA observations alone are not acceptance.
Use one current review request per PR/full head and check existing receipts before
pinging. Record the request owner, permalink and state; transfer an unavailable reviewer
once to an eligible fallback, otherwise BLOCKED. A new head supersedes the old request
and invalidates its verdict. Preserve valid existing reviews. Routing, acknowledgments,
pending requests and silence are not PASS. State NOT_MEASURED if unassigned.

Hosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep
E2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the
disposable test account owns the fixture grow and its selected tent/plant;
tag every saved grow record `[smoke <timestamp>]`. Never write customer data or
use the KEEP account. Stop a write if identity, ownership or tagging cannot
be verified; report that exact safety gap rather than proposing another host.
Local/CI fixtures validate code, not production. Repository integration follows
the explicit merge gate in AGENTS.md; it is not production acceptance. No
Publish, production APPLY, real charge, role/auth change, device control or
Action Queue operation is authorized here. Existing owner locks remain.
See docs/production-only-verification-runbook.md.

---

## Rules that make handoffs trustworthy

**Report what happened, not what was intended.** If tests fail, include the output. If a
step was skipped, say it was skipped. If something is done and verified, say so plainly
without hedging.

**Separate verified from inferred.** The receiving agent cannot tell the difference and
will treat everything as verified unless told otherwise. Anything you concluded rather
than observed belongs under `assumptions`.

**Name the ref you audited.** "The sitemap has 51 URLs" is true on the deploy branch and
false on `main`. A finding without a ref is not a finding.

**Do not launder a blocker.** `BLOCKED` propagates. If your input was blocked, your output
is blocked on that axis, no matter how much surrounding work succeeded.

**Completeness claims require enumeration.** Do not write "all routes checked" unless you
enumerated them. A hand-built list that claims completeness is worse than one that does
not, because it stops the next agent from looking.

**Scope down, never up.** If a slice turns out larger than approved, hand back with the
finding. Do not expand the slice because you are already in the file.

---

## Escalation

Return `STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE` when a required file is missing or
instructions conflict.

Conflicts follow `AGENTS.md` §0.1. Report the conflict; do not silently pick one.

Who may approve a ship is the founder seat in `docs/agents/constitution/roster.md`.
The assigned QA reviewer reports evidence; it does not authorize release.

## Historical routing

The paragraphs below are the prior routing text, kept word for word. They do not assign a current seat.

Independent acceptance routing: select an **actually available, eligible independent
reviewer session** for the complete scope under `docs/agents/OWNERSHIP.md` §4.3.
**Blue Dream and Critical Mass are retired from future routing**; preserve historical
receipts. **Codex** remains eligible on work Codex neither authored nor repaired.
A **non-contributing Claude or Grok review session** may give independent acceptance,
including for Codex-authored work; **Durban Poison** remains eligible when available.
Exclude every author and repairer even after a task transfer. A shared GitHub identity
alone does not establish independence: record session, role, contributor exclusions,
full 40-character head SHA, complete scope, evidence and verdict.
Chemdawg's existing merge gate still requires **35/35 required checks** and an independent
**PASS at the exact head SHA**, with no P1 or P2. **Graft** retains only its existing
OWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,
protected or mixed scopes still need an eligible outside reviewer. Required CI and
supplemental evidence, protected-file gates, holds, merge queue and founder-only
production controls remain. Codex uses normal pushes only: no force-push, merge,
Publish, SQL apply or production Supabase writes. Drafts remain draft.

The current holder and acceptance reviewer must be independent; changing the claim
does not erase earlier contributions. Record the reviewer actually assigned under
`docs/agents/OWNERSHIP.md` §4.3 (Chemdawg's pre-check until the bot is live). Choose an actually available, eligible independent session
for the complete scope: Codex on work Codex neither authored nor repaired, or a
non-contributing Claude/Grok review session (including for Codex-authored work), or
available Durban Poison. Graft retains only its existing low-risk allowlist; governance,
protected and mixed scopes require an eligible outside reviewer. Keep all supplemental
evidence and protected-file gates. QA observations alone are not acceptance.
Use one current review request per PR/full head and check existing receipts before
pinging. Record the request owner, permalink and state; transfer an unavailable reviewer
once to an eligible fallback, otherwise BLOCKED. A new head supersedes the old request
and invalidates its verdict. Preserve valid existing reviews. Routing, acknowledgments,
pending requests and silence are not PASS. State NOT_MEASURED if unassigned.

Prior template exclusion line, kept word for word:

```text
contributor_exclusions: every author/repairer; Codex excluded on Codex-authored or repaired work
```

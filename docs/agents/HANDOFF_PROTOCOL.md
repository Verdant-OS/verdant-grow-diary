# Verdant Agent Handoff Protocol

**Sentinel-Version: 2026-10-03.1**

Operating order is sequential for a given slice. Parallel implementation of the **same**
slice by multiple agents is the failure this protocol exists to prevent.

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

Independent acceptance routing: **Blue Dream** reviews .tsx product files, P1s and
publish gates; **Critical Mass** reviews other assigned scopes. **Durban Poison**
may supply an independently assigned acceptance. Codex cannot give its own work an
independent PASS. Claude may add peer observations but is not the acceptance reviewer.
Chemdawg owns merge only after **35/35 required checks** succeed and Blue Dream,
Durban Poison or Critical Mass gives an independent **PASS at the exact head SHA**.
Codex uses normal pushes only: no force-push, merge, Publish, SQL apply or production
Supabase writes. Drafts remain draft. Historical receipts keep their original reviewer.

Record the acceptance seat, exact reviewed head and completed/NOT_MEASURED
review state in the handoff.

Preferred research → architecture → build path (not rank; any peer may own any stage
when assigned):

```text
Grok      product intelligence, research, live-app audit, implement, test, independent review
  -> Claude    architecture / specs (and any peer power when holding the slice)
  -> Codex     build / integration (often; not exclusive) + peer powers when holding
  -> Security  review trust boundaries, exposure, secrets, infrastructure risk
  -> Gemini    independently audit quality, scope, evidence, safety, release readiness
  -> Council   resolve disagreements, give Cheek one recommendation
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
independent_reviewer: the seat assigned under OWNERSHIP.md §4.3 (Blue Dream or Critical Mass); Durban Poison if independently assigned
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
does not erase earlier contributions. Record the reviewer actually assigned under
`docs/agents/OWNERSHIP.md` §4.3 (Chemdawg's pre-check until the bot is live). Its
defaults: Blue Dream for .tsx outside src/test/, any P1 or a publish gate; Critical
Mass otherwise, unless load balancing moves that work to Blue Dream. Durban Poison may
provide acceptance when independently assigned.
Security/Gemini/Claude observations do not replace that acceptance. Name the
exact head SHA; routing is not a completed PASS. State NOT_MEASURED if unassigned.

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

Conflicts between this protocol, a role file, and `AGENTS.md` resolve in that order:
`AGENTS.md` wins, then the role file, then this protocol. Report the conflict; do not
silently pick one.

Only Cheek approves what ships. The Council Chair recommends; it does not release.

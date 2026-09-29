# Verdant Agent Handoff Protocol

**Sentinel-Version: 2026-09-28.3**

Operating order is sequential for a given slice. Parallel implementation of the **same**
slice by multiple agents is the failure this protocol exists to prevent.

**Peers (Cheek, 2026-08-20, refined):** Codex, Claude, and Grok have equal authority.
None outranks the others. Explicit task ownership controls who researches, architects,
implements, audits, tests, or independently reviews. Default strengths differ (Grok:
product intelligence / adversarial audit / implementation; Claude: specs & knowledge
architecture; Codex: often build / integration) — preference, not exclusivity. Peer
rules do **not** erase collision fences (Tranche A remaining edit points = Codex until
reassigned; Tranche B+ product code = Claude until reassigned; no competing Timeline /
Alerts / Action Queue rewrite).

### Claim + independent reviewer (standing rule)

Tasks are not owned by agents. Every open task has a coverage block in
`docs/agents/HANDOFF_LOG.md` (see `AGENTS.md`, Agent Handoff / Coverage), and any agent
may resume it after setting `claimed_by`. Every slice names:

1. **The current claim**: the agent building it now, recorded in the log
2. **One independent reviewer**: an agent that has not touched the slice

No agent that touched a slice can review it. Use the HANDOFF block below for a deliberate
transfer between roles; use the log block for day-to-day coverage. Keep the same branch,
confirm its remote head, and merge from base; never rename, recreate or force-push it.

Independent acceptance routing: **Blue Dream** reviews any .tsx file,
P1s and publish gates; **Critical Mass** reviews everything else. An author cannot
give its own work an independent PASS. Claude may add peer observations but is not
the acceptance reviewer. Matthew's Phase 1 exception permits Codex to integrate
its own low-risk PRs through the PR flow after every required check is SUCCESS
at the exact head SHA. High-risk work remains draft for GDP review and merge;
publish gates remain with Matthew. Phase 2 requires Matthew's explicit confirmation
that CI is proven. Historical receipts keep their original reviewer.

Record the acceptance seat, exact reviewed head and completed/NOT_MEASURED
review state in the handoff.

Preferred research → architecture → build path (not rank; any peer may own any stage
when assigned):

```text
Grok      product intelligence, research, live-app audit, implement, test, independent review
  -> Claude    architecture / specs (and any peer power when owning the slice)
  -> Codex     build / integration (often; not exclusive) + peer powers when owning
  -> Security  review trust boundaries, exposure, secrets, infrastructure risk
  -> Gemini    independently audit quality, scope, evidence, safety, release readiness
  -> Council   resolve disagreements, give Cheek one recommendation
  -> Cheek     approve what ships
```

An agent may hand _back_ (returning work as under-specified or unsafe) at any point. An
agent may not hand _forward_ past its successor on the preferred path, except when
`CURRENT_STATE.md` already names a different peer as the next owner or independent
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

slice_owner:
independent_reviewer: Blue Dream or Critical Mass, selected by scope/priority
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

The owner and acceptance reviewer must be independent. Route to Blue Dream
for any .tsx file, any P1 or a publish gate; otherwise Critical Mass.
Security/Gemini/Claude observations do not replace that acceptance. Name the
exact head SHA; routing is not a completed PASS. State NOT_MEASURED if unassigned.

Hosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep
E2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the
disposable test account owns the fixture grow and its selected tent/plant;
tag every saved grow record `[smoke <timestamp>]`. Never write customer data or
use the KEEP account. Stop a write if identity, ownership or tagging cannot
be verified; report that exact safety gap rather than proposing another host.
Local/CI fixtures validate code, not production. Repository integration follows
the explicit merge phases in AGENTS.md; it is not production acceptance. No
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

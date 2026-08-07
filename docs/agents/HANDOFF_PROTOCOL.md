# Verdant Agent Handoff Protocol

**Sentinel-Version: 2026-08-07.1**

Operating order is sequential. Parallel implementation by all agents is the failure this
protocol exists to prevent.

```text
Grok      research demand, competitors, SERPs, authority opportunities
  -> Claude    convert evidence into taxonomy, page systems, implementation-ready specs
  -> Codex     audit the repository and implement the smallest approved slice
  -> Security  review trust boundaries, exposure, secrets, infrastructure risk
  -> Gemini    independently audit quality, scope, evidence, safety, release readiness
  -> Council   resolve disagreements, give Cheek one recommendation
  -> Cheek     approve what ships
```

An agent may hand _back_ (returning work as under-specified or unsafe) at any point. An
agent may not hand _forward_ past its successor.

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

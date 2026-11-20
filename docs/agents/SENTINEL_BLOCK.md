# Sentinel block

**Sentinel-Version: 2026-11-20.3**

One copy of the routing and smoke rules that governance files used to repeat.
The other governance files point here. They do not restate this file.
Nothing below was rewritten. Each section is a former copy, kept whole.

## Copy from the role files, CLAUDE.md, and .grok/rules/verdant-grok-role.md

This text was identical in `CLAUDE.md`, `.grok/rules/verdant-grok-role.md`,
`docs/agents/roles/grok.md`, `docs/agents/roles/claude.md`, and
`docs/agents/roles/codex.md`.

Independent acceptance routing: select an **actually available, eligible independent
reviewer session** for the complete scope under `docs/agents/OWNERSHIP.md` §4.3.
**Blue Dream and Critical Mass are retired from future routing**; preserve historical
receipts. **Codex** remains eligible on work Codex neither authored nor repaired.
A **non-contributing Claude or Grok review session** may give independent acceptance,
including for Codex-authored work; **Durban Poison** remains eligible when available.
Exclude every author and repairer even after a task transfer. A shared GitHub identity
alone does not establish independence: record session, role, contributor exclusions,
full 40-character head SHA, complete scope, evidence and verdict.
The merge gate still requires **35/35 required checks** and an independent
**PASS at the exact head SHA**, with no P1 or P2; seats are named only in the roster. **Graft** retains only its existing
OWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,
protected or mixed scopes still need an eligible outside reviewer. Required CI and
supplemental evidence, protected-file gates, holds, merge queue and founder-only
production controls remain. Codex uses normal pushes only: no force-push, merge,
Publish, SQL apply or production Supabase writes. Drafts remain draft.
Check the existing request and receipt before pinging; keep one current review request
per PR/full head with owner, permalink and requested/running/blocked/verdict/superseded
state. Transfer an unavailable reviewer once to an eligible fallback; otherwise record
BLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence
are not PASS. Preserve a still-valid independent review without a duplicate request.

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

## Copy from docs/agents/README.md

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
The Merge Steward has no authority over the PR #1971 hold, which stays with the Coordinator.
Check the existing request and receipt before pinging; keep one current review request
per PR/full head with owner, permalink and requested/running/blocked/verdict/superseded
state. Transfer an unavailable reviewer once to an eligible fallback; otherwise record
BLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence
are not PASS. Preserve a still-valid independent review without a duplicate request.

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

## Copy from docs/agents/HANDOFF_PROTOCOL.md

The live routing paragraphs (the historical Chemdawg block later in that file
stays there, word for word). This copy ends before "Record the acceptance seat".

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

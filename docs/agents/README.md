# Verdant Agent Governance

**Sentinel-Version: 2026-10-10.1**

Independent acceptance routing: **Blue Dream** reviews .tsx product files, P1s and
publish gates; **Critical Mass** reviews other assigned scopes. **Durban Poison**
may supply an independently assigned acceptance. Codex cannot give its own work an
independent PASS. Claude may add peer observations but is not the acceptance reviewer.
Chemdawg owns merge only after **35/35 required checks** succeed and Blue Dream,
Durban Poison or Critical Mass gives an independent **PASS at the exact head SHA**.
Codex uses normal pushes only: no force-push, merge, Publish, SQL apply or production
Supabase writes. Drafts remain draft. Historical receipts keep their original reviewer.

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

Multi-agent work on Verdant runs under one shared constitution plus a small
platform-specific bootstrap per agent. A single file cannot reach every AI platform
automatically, so the layout below pairs one canonical source with the files each
platform actually auto-loads.

## Layout

```text
ROOT — auto-loaded by the platforms
  AGENTS.md                      universal constitution (canonical)
  CLAUDE.md                      imports constitution + Claude role; requires pre-ack reads of CURRENT_STATE.md and HANDOFF_LOG.md
  GEMINI.md                      mirrors the full constitution + Gemini role
  .grok/rules/verdant-grok-role.md   Grok's automatic role rules

ROLE DOCUMENTS
  docs/agents/roles/{grok,claude,codex,security,gemini,council-chair}.md

OPERATING STATE
  docs/agents/CURRENT_STATE.md   the changing shift report
  docs/agents/HANDOFF_LOG.md     current task claims and resumable coverage blocks
  docs/agents/HANDOFF_PROTOCOL.md  handoff format and rules
  docs/agents/cheek-approval-workflow.md  Cheek ship-authority decision workflow
  docs/agents/merge-queue.md       deploy-branch merge queue + snapshot script

HISTORICAL — never active instructions
  docs/archive/legacy/verdant-master-prompt-legacy.md
```

## Which files each agent loads

| Agent         | Auto-loads                                | Must also read                                                                      |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Codex         | `AGENTS.md`                               | `docs/agents/roles/codex.md`, `CURRENT_STATE.md`, `HANDOFF_LOG.md`                  |
| Claude        | `CLAUDE.md` (imports constitution + role) | `CURRENT_STATE.md`, `HANDOFF_LOG.md` — read before `SENTINEL_ACK`                   |
| Grok          | `AGENTS.md`, `.grok/rules/*`              | `docs/agents/roles/grok.md`, `CURRENT_STATE.md`, `HANDOFF_LOG.md`                   |
| Gemini        | `GEMINI.md`                               | `docs/agents/roles/gemini.md`, `CURRENT_STATE.md`, `HANDOFF_LOG.md`                 |
| Security      | nothing automatically                     | all of: `AGENTS.md`, `CURRENT_STATE.md`, `HANDOFF_LOG.md`, `roles/security.md`      |
| Council Chair | nothing automatically                     | all of: `AGENTS.md`, `CURRENT_STATE.md`, `HANDOFF_LOG.md`, `roles/council-chair.md` |

Every agent reads `docs/agents/HANDOFF_LOG.md` before `SENTINEL_ACK` and records
`open_handoffs_checked`. After acknowledgment, keep an explicit assignment. If
unassigned, select the highest-priority open block as `AGENTS.md` defines it (a pushed
branch and a PR, with no effective claim or a last activity older than 24 hours); do not take a fresh claim or bypass a named lock.
Security and Council Chair have no repository access, so they never select or resume a
block; they act only on an explicit assignment.

Grok is Verdant's **Product Intelligence, Adversarial Audit, and Implementation Lead**
(Cheek, 2026-08-20, refined): equally empowered to research, audit the live app,
implement assigned slices, test, and independently review. Codex, Claude, and Grok
retain different default strengths but **none outranks the others** — explicit task
assignments and named locks control; otherwise `claimed_by` identifies the current
task holder. See `docs/agents/roles/grok.md` and
`docs/agents/grok-peer-elevation-map-2026-08-20.md`.

Verify Grok's discovery with `grok inspect`.

**Security and Council Chair run as web-chat agents with no repository access.** A file in
GitHub does not reach a disconnected chat session. Those two need the role prompt pasted
into their persistent project instructions, or the files attached as project knowledge.
Assuming otherwise is how an agent operates with no constitution at all.

## Why the constitution is not the whole prompt pack

`AGENTS.md` deliberately does not contain all six role prompts. Every agent reads it, and
an agent that reads everyone else's role tends to blur responsibilities and absorb work
that was not assigned. Roles stay in separate files for that reason.

## Version parity

`AGENTS.md` and `GEMINI.md` both carry `Sentinel-Version`. `GEMINI.md` embeds the full
universal constitution because Gemini cannot follow a link to get context.

Duplication invites drift, so `.github/workflows/sentinel-version-parity.yml` fails the
build when the two versions differ or when the embedded Gemini constitution differs from
`AGENTS.md`. Changing the constitution means bumping the version in both files in the
same commit.

Bump the version on any change to the universal constitution, the status vocabulary, the
startup gate, or the operating order.

Validate the governance contract with:

```bash
bun run test:sentinel-governance
node scripts/check-sentinel-version-parity.mjs <base-commit>
```

The CI workflow supplies the pull-request base or exact pre-push commit automatically.
The legacy archive is historical evidence only; its header makes clear that it must not
be loaded as active agent context.

# Verdant Agent Governance

**Sentinel-Version: 2026-09-01.1**

Multi-agent work on Verdant runs under one shared constitution plus a small
platform-specific bootstrap per agent. A single file cannot reach every AI platform
automatically, so the layout below pairs one canonical source with the files each
platform actually auto-loads.

## Layout

```text
ROOT — auto-loaded by the platforms
  AGENTS.md                      universal constitution (canonical)
  CLAUDE.md                      imports constitution + state + Claude role
  GEMINI.md                      mirrors the full constitution + Gemini role
  .grok/rules/verdant-grok-role.md   Grok's automatic role rules

ROLE DOCUMENTS
  docs/agents/roles/{grok,claude,codex,security,gemini,council-chair}.md

OPERATING STATE
  docs/agents/CURRENT_STATE.md   the changing shift report
  docs/agents/HANDOFF_PROTOCOL.md  handoff format and rules
  docs/agents/cheek-approval-workflow.md  Cheek ship-authority decision workflow
  docs/agents/merge-queue.md       deploy-branch merge queue + snapshot script

HISTORICAL — never active instructions
  docs/archive/legacy/verdant-master-prompt-legacy.md
```

## Which files each agent loads

| Agent         | Auto-loads                           | Must also read                                                    |
| ------------- | ------------------------------------ | ----------------------------------------------------------------- |
| Codex         | `AGENTS.md`                          | `docs/agents/roles/codex.md`, `CURRENT_STATE.md`                  |
| Claude        | `CLAUDE.md` (which imports the rest) | —                                                                 |
| Grok          | `AGENTS.md`, `.grok/rules/*`         | `docs/agents/roles/grok.md`, `CURRENT_STATE.md`                   |
| Gemini        | `GEMINI.md`                          | `docs/agents/roles/gemini.md`, `CURRENT_STATE.md`                 |
| Security      | nothing automatically                | all of: `AGENTS.md`, `CURRENT_STATE.md`, `roles/security.md`      |
| Council Chair | nothing automatically                | all of: `AGENTS.md`, `CURRENT_STATE.md`, `roles/council-chair.md` |

Grok is Verdant's **Product Intelligence, Adversarial Audit, and Implementation Lead**
(Cheek, 2026-08-20, refined): equally empowered to research, audit the live app,
implement assigned slices, test, and independently review. Codex, Claude, and Grok
retain different default strengths but **none outranks the others** — explicit task
ownership controls. See `docs/agents/roles/grok.md` and
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

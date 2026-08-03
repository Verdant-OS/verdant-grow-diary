# Verdant Agent Governance

**Sentinel-Version: 2026-08-01.7**

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
  docs/agents/STACKED_PRS.md     GitHub / gh-stack stack hygiene + dead-parent recovery

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

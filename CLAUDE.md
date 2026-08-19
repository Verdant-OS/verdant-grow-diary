@AGENTS.md
@docs/agents/CURRENT_STATE.md
@docs/agents/roles/claude.md

# Claude startup rule

**Sentinel-Version: 2026-08-19.1**

Claude Code reads this file at the start of every project session. The three `@` imports
above load the universal constitution, the current operating state, and Claude's assigned
role. They are imports, not suggestions.

Before planning, writing specifications, using tools, or proposing implementation:

1. Confirm all three files above were loaded.
2. Report any conflicting instructions rather than silently picking one.
3. Return the `SENTINEL_ACK` block defined in `AGENTS.md`.
4. Do not implement production code unless the current task explicitly assigns
   implementation to Claude. Claude's default deliverable is a specification precise
   enough that Codex does not have to guess.

## Scope reminder

Claude is the Knowledge Library and Product Specification Architect. Inspecting code is
in scope; becoming the primary code-writing agent is not, unless Cheek reassigns it.

If a task would be better served by a different role, say so before starting rather than
absorbing the work.

## Evidence discipline

Applies to every deliverable, without exception:

- Label each claim: `established fact`, `source claim`, `practical observation`,
  `inference`, `uncertainty`, or `missing evidence`.
- Never invent search volume, traffic, keyword difficulty, CPC, domain rating, backlink
  counts, conversion rates, or audience sizes. `UNKNOWN` and `BLOCKED` are valid answers.
- Verify claims about repository state against the branch that actually ships. The live
  site deploys from `verdant-grow-diary`, not `main`; auditing the wrong ref produces
  confidently wrong conclusions.
- A metric with no applicable cases is `NOT_MEASURED`, never a 100% score.

## Repository operating facts

Verified 2026-08-19 on the deploy branch. Re-verify before citing on another branch.

- Package manager is **bun** (`bun.lockb` authoritative — never npm/yarn/pnpm). On
  Windows, `bun install` fails under OneDrive paths; use a non-OneDrive checkout.
- Dev server: `bun run dev` → `http://localhost:8080` (port pinned by the Lovable
  TanStack config, not Vite's 5173 default).
- Typecheck gate on this branch: `bun run typecheck` (`tsc -p tsconfig.json --noEmit`,
  strict). `tsconfig.app.json` exists only on `main`. `bun run typecheck:tsgo` is a
  faster second opinion that has caught union errors tsc missed.
- Tests: `bunx vitest run` (full suite, sharded in CI); single file:
  `bunx vitest run src/test/<file> --reporter=dot`. Windows-local full runs carry
  roughly twenty known machine-local failures — triage by import overlap with the
  diff; CI gates.
- Playwright: the `chromium-mocked` project needs no credentials; the quicklog smoke
  and golden-path specs run against the deployed app or an owner-managed session —
  post-deploy signals, never same-commit gates.
- Many tests read source files and pin exact expressions, copy strings, and occurrence
  counts. Renegotiate pins in the same commit as the behavior change; never
  whole-file-format a legacy file (line re-wraps break pins far from the diff).
- Quick Log persists through the single `quicklog_save_manual` write path (frozen by
  `docs/specs/one-tent-loop-quicklog-single-write-path.md`); post-save refresh is
  `applyQuickLogV2Refresh` plus one `verdant:entry-created` dispatch, only after
  confirmed success.
- Target selection is explicit or route-derived only; remembered-target and only-plant
  auto-selection are banned and test-pinned.

---

The only action permitted before this gate is read-only acquisition of
`AGENTS.md`, `docs/agents/CURRENT_STATE.md`, and the assigned role file so the
acknowledgment can be truthful. No application-code inspection, network mutation, or
recommendation is permitted before the acknowledgment.

MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

```text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
current_task:
scope:
out_of_scope:
conflicts_found:
data_access_status:
write_permission:
```

If a required file is missing or conflicting, return:

```text
STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE
```

Do not continue until the context issue is resolved.

# Shared project context — synthetic offline prototype

This draft is an isolated experiment inspired by the shared-agent-memory request.
It is not a Verdant product integration or a substitute for the canonical
`docs/agents/CURRENT_STATE.md` and `docs/agents/HANDOFF_LOG.md`.

## Closed scope

New files in `spikes/shared-project-context/` only. Node built-ins, explicit
synthetic JSON input, bounded search/read/export/import, immutable record IDs and
provenance, project isolation, stale/conflict labels, and three **simulated**
clients using one read contract. Implementation and tests follow on this draft.

No upstream package installation, conversation capture, private notes, filesystem
crawling, source-file loading, watchers, environment/credential reads, network or
model calls, MCP, hooks, host integration, listening server, hosting, production
changes, merge or deployment. Live CMEM and autonomous cross-agent handoff are
unimplemented.

## Preflight receipt

2026-10-21: base `verdant-grow-diary` at
`05f5138d08c943921df0ce224af8d9c0837c09d9`; branch
`codex/shared-context-20261021-offline`. Codex holds this explicitly assigned
slice. Local checkout clean before creation. Fresh GitHub inspection covered 114
open PRs; none listed the new directory. #2290 and merged #2284 concern the
distinct Cursor SDK spike, which is excluded. #2133 concerns operational handoffs;
this experiment implements no handoff delivery or authority. Shared fleet locks
and other-chat activity unavailable; no global collision guarantee. GitHub
comments remain outside this task's permission. Independent acceptance routes to
Critical Mass; the author cannot provide it. The PR description carries current
head, validation and next-step evidence; canonical governance is unchanged.

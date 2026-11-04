# Handoff Config

## Verification Commands

test: bunx vitest run <files> --reporter=dot
typecheck: NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
lint: bun run lint
build: bun run build

> test is targeted: pass the test files for the change. The full suite (`bun run test`) is very large
> and runs sharded in CI (35 required checks); do not treat a local full run as the gate.
> typecheck needs the 8 GB heap in this environment; the default heap runs out of memory.
> lint: expect 0 errors and many pre-existing warnings.

## Conventions

response_language: en
handoff_dir: .handoff
commit_style: conventional
convention_docs: AGENTS.md

## Project Documentation Index

### Agent guidance

- [CLAUDE.md](CLAUDE.md) — root agent rules
- [AGENTS.md](AGENTS.md) — agent constitution, all agents
- [GEMINI.md](GEMINI.md) — Gemini-specific mirror
- [docs/agents/roles/claude.md](docs/agents/roles/claude.md) — Claude role file
- [docs/agents/constitution/testing-standard.md](docs/agents/constitution/testing-standard.md) — testing and evidence standard

### Project docs

- [README.md](README.md) — project overview
- [docs/codebase-map.md](docs/codebase-map.md) — routes, functions, workflows inventory
- [docs/architecture.md](docs/architecture.md) — product layers and data ownership
- [docs/architecture-contract.md](docs/architecture-contract.md) — permanent architecture contract
- [docs/agents/CURRENT_STATE.md](docs/agents/CURRENT_STATE.md) — live operating state
- [docs/agents/HANDOFF_LOG.md](docs/agents/HANDOFF_LOG.md) — task claims and handoff blocks
- [docs/agents/merge-queue.md](docs/agents/merge-queue.md) — merge queue and required checks
- [docs/agents/single-builder-workflow.md](docs/agents/single-builder-workflow.md) — slice loop and PR contract
- [docs/contributing-supabase-migrations.md](docs/contributing-supabase-migrations.md) — writing migrations
- [.claude/skills/run-verdant-grow-diary/SKILL.md](.claude/skills/run-verdant-grow-diary/SKILL.md) — run, drive, screenshot app
- [docs/specs/](docs/specs/) — feature specs

### Detected toolchain

- package manager: bun (bun.lock)
- monorepo: none
- frameworks: TanStack Start (SSR) + TanStack Router, React 19, Vite, Tailwind 4, shadcn/Radix, TanStack Query, Supabase

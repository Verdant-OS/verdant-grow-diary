# Biome adoption (lint + format)

**Status:** Biome is the sole lint/format toolchain for app source. Adoption complete
on `chore/adopt-biome-lint` / PR #699 (phases 0–9).

Phased runbook + verifier: [`docs/biome-workflow.md`](./biome-workflow.md) · `bun run verify:biome`.

| Tool | Role |
| --- | --- |
| `@biomejs/biome` | Lint + format + CI gate + lint-staged |
| ESLint / Prettier | **Removed** (configs and packages) |

## Commands

| Script | Purpose |
| --- | --- |
| `bun run lint` | `biome lint .` (warnings visible) |
| `bun run lint:ci` | fail on **errors** only (GitHub Actions) |
| `bun run format` | `biome format --write .` |
| `bun run format:check` | format check without write |
| `bun run check` | full Biome check (lint + format) |
| `bun run verify:biome` | phase 0–9 toolchain verifier |

## CI

- `.github/workflows/lint.yml` — job `biome` → `bun run lint:ci` + `format:check` + `verify:biome:quick`
- `.github/workflows/ci.yml` — `bun run lint`
- Pheno narrow gate uses `biome lint` on owned paths

## Config (`biome.json`)

- Formatter: double quotes, width 100, LF (former Prettier defaults)
- Linter: `recommended` preset with demoted bulk style/a11y noise
- Tailwind CSS v4 directives enabled for CSS
- `server-only` restricted import under `src/**` (TanStack Start contract)
- a11y recommended rules off (`a11y.preset: "none"`) — parity with prior ESLint gate
- Tests / scripts / edge functions: looser `noExplicitAny` / hooks noise

## History

- Replaced ESLint + `eslint-plugin-prettier` (~19k findings, multi-minute runs)
- Full format cleanup applied once on branch `chore/adopt-biome-lint` (~2459 files)
- Residual **warnings** are advisory; `lint:ci` fails only on errors (currently **0**)

## Residual warnings (advisory)

`bun run lint` reports ~54 product warnings (do not fail `lint:ci`):

| Rule | Approx | Notes |
| --- | ---: | --- |
| `useExhaustiveDependencies` | ~22 | intentional incomplete deps; migrate carefully |
| `noExplicitAny` | ~21 | transitional casts (hooks, paddle, photo cleanup) |
| `noDangerouslySetInnerHtml` / other | few | review when touching those call sites |

Bulk noise demoted/off: `noArrayIndexKey`, `noTemplateCurlyInString` (scanner string fixtures),
`noAssignInExpressions`, `noPrototypeBuiltins`, a11y recommended.

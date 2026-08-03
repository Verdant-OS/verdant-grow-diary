# Biome adoption (lint + format)

**Status:** Biome is the sole lint/format toolchain for app source.

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

## CI

- `.github/workflows/lint.yml` — job `biome` → `bun run lint:ci`
- `.github/workflows/ci.yml` — `bun run lint`
- Pheno narrow gate uses `biome lint` on owned paths

## Config

- `biome.json` — formatter: double quotes, width 100, LF (former Prettier defaults)
- Tailwind CSS v4 directives enabled for CSS
- `server-only` restricted import under `src/**`
- a11y recommended rules off (parity with prior ESLint gate)
- Tests / scripts / edge functions: looser `noExplicitAny` / hooks noise

## History

- Replaced ESLint + `eslint-plugin-prettier` (~19k findings, multi-minute runs)
- Full format cleanup applied once on branch `chore/adopt-biome-lint`
- Residual **warnings** are advisory; `lint:ci` fails only on errors


## Residual warnings (advisory)

`bun run lint` may still report ~50 product warnings (do not fail `lint:ci`):

| Rule | Approx | Notes |
| --- | ---: | --- |
| `useExhaustiveDependencies` | ~20 | intentional incomplete deps; migrate carefully |
| `noExplicitAny` | ~20 | transitional casts (hooks, paddle, photo cleanup) |
| `noDangerouslySetInnerHtml` / other | few | review when touching those call sites |

Bulk noise demoted/off: `noArrayIndexKey`, `noTemplateCurlyInString` (scanner string fixtures),
`noAssignInExpressions`, `noPrototypeBuiltins`, a11y recommended.

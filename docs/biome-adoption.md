# Biome adoption (lint + format)

**Status:** CI lint gate uses Biome (`@biomejs/biome` 2.5.6).  
ESLint + Prettier remain installed for transitional local use (`bun run lint:eslint`, legacy configs).

## Why

Repo-wide `eslint .` with `eslint-plugin-prettier` was reporting ~19k findings
(~96% `prettier/prettier`) and taking minutes. Biome lints the tree in ~10s and
separates **errors** (CI fail) from **warnings** (advisory).

## Commands

| Script | Purpose |
| --- | --- |
| `bun run lint` | `biome lint .` (shows warnings) |
| `bun run lint:ci` | fail on **errors** only (GitHub Actions) |
| `bun run lint:eslint` | legacy ESLint (optional) |
| `bun run format` | `biome format --write .` |
| `bun run format:check` | format check without write |
| `bun run check` | full Biome check (lint + format) |

## CI

- [`.github/workflows/lint.yml`](../.github/workflows/lint.yml) — job name `biome`
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `bun run lint` → Biome
- Pheno narrow gate uses `biome lint` on owned paths

## Config

- [`biome.json`](../biome.json) — formatter aligned with former Prettier (double quotes, width 100, LF)
- Tailwind CSS v4 directives enabled for `src/styles.css`
- Preserves ESLint’s `server-only` restricted import for `src/**`
- a11y recommended rules off for now (were not part of the old ESLint gate)
- Tests / scripts / edge functions: looser `noExplicitAny` / hooks noise

## Migration notes

- Do **not** mass-format the monorepo in feature PRs; run `format` in dedicated cleanup if desired.
- ESLint packages can be removed in a follow-up once no workflow depends on them.
- Residual warnings (~500) are intentional debt (hooks deps, `any`, etc.) and do not fail `lint:ci`.

# Biome workflow (phased)

Executable checklist for adopting and maintaining Biome.
Verifier: `bun run verify:biome` → [`scripts/verify-biome-toolchain.mjs`](../scripts/verify-biome-toolchain.mjs).

Adoption narrative: [`docs/biome-adoption.md`](./biome-adoption.md).

## Verdant status (`chore/adopt-biome-lint` / PR #699)

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Preconditions | ✅ Done |
| 1 | Install + scripts | ✅ Done (`@biomejs/biome@2.5.6`) |
| 2 | migrate prettier | ⏭️ Skipped (hand-mapped; Prettier removed) |
| 3 | migrate eslint | ⏭️ Skipped (hand-mapped; ESLint removed) |
| 4 | `biome migrate` | ✅ Done (`a11y.preset: "none"`) |
| 5 | Tune error/warn gate | ✅ Done (`lint:ci` errors-only) |
| 6 | Full format | ✅ Done (~2459 files) |
| 7 | CI + lint-staged | ✅ Done |
| 8 | Remove ESLint/Prettier | ✅ Done |
| 9 | Ongoing / verify | ✅ Done (`verify:biome` 13/13; CI job `biome` green) |

**Legend:** ✅ complete · ⏭️ skipped on purpose · 🔄 maintained via verifier · ❌ blocked / failed

---

## Phase 0 — Preconditions

- [ ] Repo has `package.json` + lockfile  
- [ ] If migrating: keep Prettier/ESLint configs **until** Phases 2–3 finish  
- [ ] Prefer classic `.eslintrc.*` for `biome migrate eslint` (flat config needs resolvable imports)

## Phase 1 — Install & bootstrap

```bash
bun add -d -E @biomejs/biome
bunx biome init   # or commit a known-good biome.json
```

Required scripts (enforced by verifier):

| Script | Command |
| --- | --- |
| `lint` | `biome lint .` |
| `lint:ci` | `biome lint . --diagnostic-level=error` |
| `format` | `biome format --write .` |
| `format:check` | `biome format .` |
| `check` | `biome check .` |
| `biome:migrate` | `biome migrate --write` |
| `verify:biome` | phase verifier |

## Phase 2 — Import Prettier (optional if already Biome)

```bash
bunx biome migrate prettier
bunx biome migrate prettier --write
```

Review `formatter.includes` vs top-level `files.includes`.

## Phase 3 — Import ESLint (optional if already Biome)

```bash
bunx biome migrate eslint
bunx biome migrate eslint --write
# optional:
bunx biome migrate eslint --include-inspired --include-nursery --write
```

Hand-port: restricted imports, test/script overrides, CI severity policy.

## Phase 4 — Schema / breaking config

```bash
bunx biome migrate
bun run biome:migrate   # writes
```

## Phase 5 — Tune gate

```bash
bun run lint            # warnings visible
bun run lint:ci         # CI — errors only
```

Keep **errors** for contract rules (e.g. `server-only` ban). Demote bulk style/a11y noise.

## Phase 6 — Format once

```bash
bun run format
bun run format:check
# dedicated commit — do not mix with product logic
```

## Phase 7 — CI + hooks

- Workflow job runs `bun run lint:ci` (and preferably `format:check` + `verify:biome`)  
- `lint-staged` → `biome check --write …`  
- Editor: Biome recommended via `.vscode/extensions.json`
- Optional local `.vscode/settings.json` (often gitignored): set `editor.defaultFormatter` to `biomejs.biome` and `eslint.enable: false`

## Phase 8 — Remove legacy tools

```bash
bun remove eslint prettier typescript-eslint # + plugins
rm -f eslint.config.js .eslintrc* .prettierrc* .prettierignore
```

## Phase 9 — Ongoing

```bash
bun add -d -E @biomejs/biome@latest   # when upgrading
bun run biome:migrate
bun run verify:biome
bun run lint:ci
```

Chip product warnings (`noExplicitAny`, `useExhaustiveDependencies`) in small PRs — they do not fail `lint:ci` today.

---

## Local one-shot (post-adoption)

```bash
bun run verify:biome        # full (lint:ci + format:check)
bun run verify:biome:quick  # package/config only
```

The verifier prefers `node_modules/.bin/biome` and falls back to `bunx` / `npx`, and
`bun run` / `npm run` for package scripts, so agent sandboxes without Bun on `PATH` still work.

# Repo-wide ESLint cleanup plan

## Current status

Repo-wide lint (`bun run lint` → `eslint .`) currently reports **89 errors across
43 files** (measured on the `verdant-grow-diary` line; the pheno-hardening slice
prose rounded this to ~90). **None of these errors are in pheno / contextual-pheno
files** — they are all pre-existing, unrelated debt (test files, dev scripts, and a
handful of `src/lib`/`src/constants` modules).

Because of this, CI does **not** run full lint. The `Pheno Comparison v0` workflow
runs a **narrow lint** over only the pheno-owned source + presenter-owned test
files, which must stay green on every PR. See the `Lint — Pheno / Contextual Pheno
owned files` step in `.github/workflows/pheno-comparison-v0.yml`.

## Reproduce the current failure

```bash
bun install
bun run lint            # eslint .  → exits non-zero with the 89 errors

# Machine-readable breakdown (counts by rule):
bunx eslint . -f json > /tmp/lint.json
node -e 'const r=require("/tmp/lint.json");const b={};r.forEach(f=>f.messages.forEach(m=>{if(m.severity===2)b[m.ruleId]=(b[m.ruleId]||0)+1}));console.log(b)'
```

## Error categories (by rule)

| Rule                                                     | Count | Auto-fixable? | Notes                                                                                                                          |
| -------------------------------------------------------- | ----: | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `no-useless-escape`                                      |    48 | ✅ `--fix`    | Redundant `\-`, `` \` `` etc. in string/regex literals. Mechanical.                                                            |
| `@typescript-eslint/no-require-imports`                  |    19 | ⚠️ manual     | `require()` in scripts/tests; convert to `import` (or scope an override for `scripts/**`/CJS).                                 |
| `no-control-regex`                                       |     5 | ⚠️ review     | Control chars (`\x00`–`\x1f`) in **sanitizer** regexes — often intentional; candidate for per-line disable-with-justification. |
| `@typescript-eslint/ban-ts-comment`                      |     5 | ⚠️ manual     | `@ts-ignore` → `@ts-expect-error` + a ≥3-char description.                                                                     |
| `prefer-spread`                                          |     5 | ✅ `--fix`    | `.apply(...)` → spread. Mechanical.                                                                                            |
| `no-irregular-whitespace`                                |     2 | ✅ `--fix`    | Stray non-breaking/zero-width spaces.                                                                                          |
| `@typescript-eslint/no-non-null-asserted-optional-chain` |     2 | ⚠️ review     | Possible real latent bug (`a?.b!`); fix by hand, don't blanket-disable.                                                        |
| `@typescript-eslint/no-empty-object-type`                |     1 | ⚠️ trivial    | `interface X {}` extending a supertype.                                                                                        |
| `import/first`                                           |     1 | ✅ trivial    | Move import above other statements.                                                                                            |
| `no-empty`                                               |     1 | ⚠️ trivial    | Empty block; add a comment or handle.                                                                                          |

### Error concentration (by file area)

Roughly ordered by error count; all pre-existing and unrelated to pheno:

- `src/test/**` — the majority (ecowitt/testbench/docs/evidence/action-queue specs, etc.)
- `scripts/dev/**` and `scripts/**` — CJS `require()` + escapes
- `src/lib/**` — `proofReportRedactionRules.ts`, `aiDoctorReportRules.ts`,
  `actionQueueReturnLinkRules.ts`, `actionQueueUrlStateRules.ts`, `authRedirectRules.ts`,
  `csvSensorPreviewPdf.ts`, `evidenceCoverageViewModel.ts`, `sensorIngestAuditReportRules.ts`
- `src/constants/sensorProviderLabels.ts`

## Recommended cleanup phases

**Phase 1 — hold the line (current state).**
Keep the pheno **narrow lint** as the PR gate. It protects the touched pheno /
contextual-pheno files and prevents new debt there, while not blocking on the 89
unrelated pre-existing errors.

**Phase 2 — baseline only if needed.**
If the full cleanup cannot be completed quickly, introduce an **explicit baseline**
so `eslint .` can run in CI while the known 89 are acknowledged (not silently
hidden). Options, in order of preference:

1. A committed baseline file (e.g. via [`eslint-nibble`]/a baseline plugin or a
   generated allowlist of `file:rule` pairs) that CI diffs against — **new** errors
   fail, known ones don't.
2. `eslint . --max-warnings 0` after **downgrading only the specific pre-existing
   rule violations to warnings via narrowly-scoped `overrides`** (never globally).

Do **not** add a permanent blanket allowlist that would also hide _new_ errors in
touched files. Any baseline must fail on regressions in pheno / contextual-pheno
files and on brand-new violations elsewhere.

**Phase 3 — chip away by directory/rule.**

1. `eslint . --fix` for the auto-fixable rules (`no-useless-escape`, `prefer-spread`,
   `no-irregular-whitespace`) — ~55 errors, mechanical, review the diff.
2. `scripts/**` + tests: convert `require()` → `import` (or add a scoped `overrides`
   allowing `no-require-imports` for `*.cjs`/`scripts/**` if they must stay CJS).
3. `ban-ts-comment`: `@ts-ignore` → `@ts-expect-error` with descriptions.
4. `no-control-regex`: per-line `// eslint-disable-next-line no-control-regex` with a
   one-line justification where the control chars are intentional sanitization.
5. `no-non-null-asserted-optional-chain`: fix by hand (each is a potential bug).
6. Sweep the trivial singletons (`no-empty-object-type`, `import/first`, `no-empty`).

**Phase 4 — enable full lint in CI.**
Once `bun run lint` is clean (0 errors):

1. Add a `bun run lint` step to CI (or promote it into an existing workflow).
2. Remove/retire the narrow pheno lint step (or keep it as a fast pre-check).
3. Optionally add `--max-warnings 0` to keep warnings from accumulating.

## Which errors to fix vs. allowlist

- **Fix (bulk, low risk):** `no-useless-escape`, `prefer-spread`,
  `no-irregular-whitespace`, `import/first`, `no-empty-object-type`.
- **Fix (manual, per-file):** `no-require-imports`, `ban-ts-comment`, `no-empty`.
- **Fix (careful — real bug risk):** `no-non-null-asserted-optional-chain`.
- **Allowlist candidate (per-line, justified):** `no-control-regex` where the
  control characters are deliberate (input sanitization). Prefer a scoped
  `// eslint-disable-next-line` with a comment over a global rule change.

## How to enable full lint in CI (target end state)

```yaml
# Replace the narrow pheno lint step with, or add alongside it:
- name: Lint (full repo)
  run: bun run lint # eslint .  — must be 0 errors
```

Gate on this only after Phase 3 reaches 0 errors, or after Phase 2 installs a
regression-only baseline.

## Risk notes

- `eslint . --fix` can touch many files at once — review the diff, run the full
  vitest + typecheck suites afterward, and land it as its own PR (not bundled with
  feature work).
- `no-control-regex` and `no-non-null-asserted-optional-chain` fixes can change
  behavior — treat those as code changes, not formatting, and add/adjust tests.
- Converting `require()` → `import` in scripts can break Node/CJS execution if a
  script is run directly with `node`; verify each script still runs.
- Do not weaken rules globally to force green — that hides future regressions in
  pheno-owned files, which is the exact thing the narrow lint protects.

## Rollback notes

- This document is planning-only; it changes no lint behavior. Deleting it is a
  no-op for CI.
- If a future baseline/allowlist is introduced and proves too permissive, revert
  the baseline file and restore the narrow-lint-only gate (Phase 1) — no product
  code is affected.
- Any `--fix` sweep should be a standalone commit/PR so it can be reverted
  independently of feature work.

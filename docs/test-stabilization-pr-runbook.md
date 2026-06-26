# Test-Stabilization PR Runbook

This runbook captures the **only** safe way to open a test-stabilization PR
into `main`. It exists because Lovable working branches routinely contain
large product scope (genetics, Harvest Watch, harvest/cure persistence,
Harvest Evidence Report, Supabase migrations, Edge Functions, proof
surfaces) that must never be smuggled into `main` under a
"test-stabilization" label.

If the diff against `origin/main` is not small and harness-only, **do not
open the PR.**

---

## Hard exclusions

The following must **never** be staged for a stabilization PR:

- Genetics / breeding files (lib, components, edge functions, xlsx adapters)
- Harvest Watch files
- Harvest / Cure files (including Grove Bag airflow + cure fields)
- Harvest Evidence Report files (libs, components, hooks)
- Supabase migrations (`supabase/migrations/**`)
- Supabase Edge Functions (`supabase/functions/**`)
- Product pages (`src/pages/**`)
- Product components and libs under `src/components/**` / `src/lib/**`
  unless they are clearly test-only and added to the harness allowlist
- AI Doctor / proof surfaces
- Billing / entitlements code

If you are unsure whether a file is harness-only, leave it out and open it
in its own scoped PR.

---

## Operator commands

Run these from a clean local clone:

```bash
git fetch origin
git checkout -b test/stabilize-suite-windows origin/main

# Bring over ONLY confirmed harness/test files from the Lovable branch.
git checkout <lovable-working-branch> -- \
  src/test/setup.ts \
  vitest.config.ts \
  scripts/sensor-safety-check.mjs \
  scripts/summarize-vitest-timeouts.mjs

# Pre-commit scope check (staged files only).
node scripts/verify-stabilization-pr-scope.mjs --staged

# Branch-level scope check (everything that would land in the PR).
node scripts/verify-stabilization-pr-scope.mjs --base origin/main

git diff --stat origin/main
git diff --name-only origin/main

# Local validation.
bun run typecheck
node scripts/sensor-safety-check.mjs
bunx vitest run --reporter=dot
```

If either `verify-stabilization-pr-scope` invocation prints
`STOP-SHIP: this branch is not test-stabilization only.`, **unstage the
blocked files** (or delete the branch and start over) before retrying.

---

## PR rules

- **Title:** `test: stabilize full suite on Windows and local Vitest`
- **Label:** `test-stabilization` (required — CI scope gate keys off this)
- **Body must include:**
  - Exact validation counts:
    - `typecheck: <result>`
    - `sensor-safety-check: <result>`
    - `vitest: <passed> passed / <failed> failed / <skipped> skipped`
  - The sentence: **"No product behavior changes."**
  - An explicit "Excluded" section noting that any Lovable working-branch
    product changes are intentionally excluded and must ship in their own
    scoped PRs.

---

## CI behavior

`.github/workflows/stabilization-pr-scope.yml` runs only on PRs labeled
`test-stabilization` (also re-runs when the label is added). It calls:

```bash
node scripts/verify-stabilization-pr-scope.mjs --base origin/${{ github.base_ref }}
```

A non-zero exit fails the PR with a `STOP-SHIP` verdict. The script is
intentionally conservative: when in doubt, it blocks.

---

## Why this gate exists

Past Lovable working branches have shown diffs of 1,000+ files containing
schema/RLS/RPC migrations, edge functions, genetics/breeding modules,
Harvest Watch, harvest/cure persistence, evidence reporting, and proof
surfaces. None of that can honestly be represented as test stabilization.
This gate forces product work into separate, scoped PRs.

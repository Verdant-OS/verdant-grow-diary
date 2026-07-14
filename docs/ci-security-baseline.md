# CI security-scan baseline for Supabase migrations

## What it does

`scripts/check-supabase-migration-safety.mjs` is a static, dependency-free
scanner over `supabase/migrations/*.sql`. It runs on every push and PR to
`main` via `.github/workflows/supabase-security-baseline.yml` and fails
the build when a NEW high-risk pattern appears that is not present in
`config/supabase-migration-safety-baseline.json`.

## High-risk patterns detected

1. **SEARCH_PATH_MUTABLE** — `SECURITY DEFINER` function without a
   `SET search_path` clause in the same `CREATE FUNCTION` statement.
   Matches Supabase linter rule `0011_function_search_path_mutable`.
2. **PERMISSIVE_POLICY** — `CREATE POLICY` for `INSERT`, `UPDATE`, or
   `DELETE` with `USING (true)` or `WITH CHECK (true)`. `SELECT ... USING
   (true)` is intentionally allowed for public-read tables.
3. **TABLE_WITHOUT_RLS** — `CREATE TABLE public.<x>` without a matching
   `ALTER TABLE public.<x> ENABLE ROW LEVEL SECURITY` anywhere in the
   migrations tree.

## Baseline

`config/supabase-migration-safety-baseline.json` holds fingerprints
(`sha256(scanner|migration|normalized-snippet)`, first 16 chars) of the
findings that were already present when the guardrail was introduced.
Historical accepted findings do not fail CI; new findings do.

**Never** silence a new finding by adding it to the baseline. Fix the
migration instead. The only legitimate reason to run
`bun run check:supabase-security:update-baseline` is when a genuine
pre-existing finding has been corrected in-place and you want to
remove its fingerprint — reviewers should verify the diff shows a
strict reduction in accepted entries.

## Local commands

```
bun run check:supabase-security                # run the scanner
bun run check:supabase-security:update-baseline # regenerate baseline (rare)
```

## Tests

`src/test/check-supabase-migration-safety.test.ts` exercises the CLI
against a synthetic migrations tree in `/tmp` and asserts each detector
fires on a new bad migration and stays quiet on well-formed input.

## Scope and non-goals

- Static only. It does not connect to any database and does not need
  Supabase credentials in CI.
- Does not replace the Supabase linter or the Lovable security scanner.
  It catches the highest-signal patterns at PR time so regressions are
  blocked before merge; runtime scans still run after deploy.
- Does not scan edge functions, RLS policy predicates for logic bugs,
  or dependency vulnerabilities (that is `check:deps`).

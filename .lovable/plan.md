# Fix: pheno_crosses.channel missing in production

## Confirmed diagnosis
- `src/lib/phenoKeepersService.ts` `listCrossesForHunt` selects `channel, generation, recurrent_parent_id` from `pheno_crosses`.
- Those columns are added by `supabase/migrations/20260707210000_pheno_crosses_full_taxonomy.sql`, which is present in the repo and pinned by `src/test/required-core-migrations-gate.test.ts` (`PHENO_CROSSES_TAXONOMY_COLUMNS`).
- Production is throwing Postgres `42703` on `pheno_crosses.channel` (9 hits, 2026-07-28). The migration exists locally but is not recorded in the production ledger — this matches the earlier `BLOCKED_LEDGER_FILENAME_DIVERGENCE` and `BLOCKED_PHENO_ACL_LEAK` audits.

## Why no code change here
The frontend code and migration file are correct. This is a **production schema-drift issue**, not a code defect. Per project rules the sandbox never applies migrations to production; only Matthew's Windows machine dispatches the pinned production migration workflows.

## Recommended path (operator-run, from Windows)
The reconciliation migration `supabase/migrations/20260728090000_production_schema_reconciliation.sql` already covers the missing pheno taxonomy columns, but its last apply attempt was halted with `BLOCKED_PHENO_ACL_LEAK` because production `pheno_crosses` / `pheno_reversals` carry a legacy default-ACL leak (anon/authenticated hold 8 privileges each).

Two ordered steps:

1. **Author an additive REVOKE migration** normalizing `pheno_crosses` and `pheno_reversals` ACLs to the canonical set (`GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated; GRANT ALL ... TO service_role;` after `REVOKE ALL ... FROM anon, authenticated`). No column changes.
   - New file: `supabase/migrations/<new-ts>_pheno_crosses_acl_normalize.sql`.
   - Ship via normal PR + `Apply pinned production migrations` workflow.

2. **Re-dispatch** `.github/workflows/apply-pinned-production-migrations.yml` for `20260728090000_production_schema_reconciliation.sql`. With the ACL leak closed, the `DO $reconcile$` guard will pass and `channel`, `generation`, `recurrent_parent_id` will be added to `pheno_crosses`.

## Verification after apply
- `/operator/schema-audit` should show `pheno_crosses` taxonomy columns present and RLS/ACL audit clean.
- `select column_name from information_schema.columns where table_name='pheno_crosses' and column_name in ('channel','generation','recurrent_parent_id');` returns 3 rows.
- Pheno Hunt cross list stops emitting `42703` in edge logs.

## Rollback
Both migrations are additive; no destructive change. Rollback is only necessary if the REVOKE breaks a policy — mitigate by re-granting the exact prior set from the schema baseline at `/mnt/documents/db-baselines/schema-baseline-20260724T103225Z.txt`.

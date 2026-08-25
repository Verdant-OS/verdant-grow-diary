# Restored history ledger reconciliation operator runbook

This runbook covers the protected predeploy prerequisite for PR #1113. It is
not a migration runner, a fresh-replay repair, or permission to deploy.

## Safety boundary

The operation may insert exactly three reviewed identities into
`supabase_migrations.schema_migrations` after their immutable Git blobs and
their already-live catalog effects are proven. It never executes those SQL
files and must not read or write application, grower, authentication, sensor,
billing, AI-credit, or Action Queue rows.

The only eligible restored identities are:

| Version          | Name                                    | Why execution is refused                                                           |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `20260710003638` | `pheno_hunt_setup_backfill`             | A late replay can replace an intentionally cleared setup timestamp.                |
| `20260710013255` | `staff_role_grant_trigger_and_backfill` | A late replay can recreate a deliberately revoked staff role.                      |
| `20260725033124` | `core_schema_forward_repair`            | A late replay can temporarily replace the newer dual-timestamp Quick Log contract. |

Do not add any other restored migration to this operation without a separate
review, exact hash evidence, and a new owner decision. In particular,
`20260823120000_restored_history_ai_credit_pheno_quicklog_repair.sql` is a real
forward repair and must remain pending for the ordinary migration runner.

## What this does not solve

This reconciliation protects the existing production database from a late
incremental execution of the three bodies. It does **not** repair a new
Supabase Preview database that replays raw Git history from the beginning.
PR #1113 still requires a genuinely green, exact-head fresh Preview/reset lane
before merge.

The earlier `$0.01344/hour` Preview approval is not authorization for this
production ledger write. `APPLY` requires a new action-time decision through
the protected `verdant-production-solo-founder` environment.

## Required sequence

1. Land this prerequisite tooling on `verdant-grow-diary` with all relevant CI
   green and independent review complete.
2. Update PR #1113 onto that target. Freeze and record its exact head.
3. Confirm the Git-tree migration audit reports zero target migration edits or
   deletions and the three candidate blobs retain the pinned SHA-256 values.
4. Dispatch `Reconcile restored history ledger` from the exact current
   `verdant-grow-diary` head with operation `PREFLIGHT`, PR number `1113`, the
   exact PR head SHA, the production project ref, and the founder
   acknowledgement.
5. Review the sanitized report and receipt. A safe receipt must prove the
   exact repository/workflow/run identities, exact deploy and PR heads, exact
   candidate hashes, all three target ledger identities absent with no
   collisions, the exact ledger contract, and the expected Pheno, staff, and
   Quick Log system-catalog fingerprints. The cross-run state digest excludes
   `run_id` and `run_attempt` because PREFLIGHT and APPLY are separate runs;
   the artifact verifier authenticates those provenance fields independently.
6. Wait the policy review interval. Separately dispatch `APPLY` from the same
   deploy head with the reviewed PREFLIGHT run ID, attempt, artifact SHA-256,
   exact confirmation phrase, and a fresh protected-environment approval.
7. Preserve the APPLY evidence. Verify all three marker rows exist exactly
   once, catalog fingerprints are unchanged, and the report records no
   application-table access.
8. Only then allow the ordinary production migration plan to be generated.
   Verify the three bodies are skipped while every other restored migration
   and the real additive repair remain scheduled normally.
9. Keep PR #1113 open until its fresh Preview, local reset, database security,
   pgTAP, Quick Log trust-boundary, review-thread, and mergeability gates all
   pass at the exact current head.

## Fail-closed results

Stop without a write when any of these occurs:

- wrong repository, branch, deploy SHA, PR number, PR head, PR base, project
  ref, database identity, connection role, workflow, actor, or run attempt;
- a candidate blob hash differs or the PR head cannot be fetched read-only;
- the ledger table shape, heap access method, owner, canonical deterministic
  column/index collations and operator classes, table/column/effective
  application-role privileges, primary key, exact idempotency index,
  column/default/generated/identity contract, RLS state, persistence,
  partition/inheritance state, INSERT publication membership, trigger set, or
  rewrite-rule set differs;
- any target version, name, or exact reconciliation idempotency-key collision exists;
- only some of the three marker rows exist;
- the shifted canonical staff witness is absent or any second ledger row shares
  its version/name identity axis;
- the legacy staff helper regains anon/authenticated/service-role execution,
  the canonical helper ACL differs from its exact owner/service-role contract,
  any noncanonical trigger invokes either staff helper, or any Pheno, staff,
  or Quick Log catalog fingerprint differs;
- another production migration writer is running;
- the reviewed PREFLIGHT artifact is missing, stale, unauthenticated, or does
  not match the fresh preflight state digest;
- TLS verification or the protected database secret is unavailable.

`BLOCKED` is the correct result for unavailable access or infrastructure.
Catalog or identity drift is a verified refusal, not permission to normalize
production.

## Write shape and recovery

The APPLY transaction takes the shared advisory lock and a
`SHARE ROW EXCLUSIVE` lock on the migration ledger, reruns every invariant,
then performs three plain inserts. It uses neither `ON CONFLICT` nor an
application-table statement. A failure before commit leaves zero marker rows.

If commit succeeds but the final read-only postflight is interrupted, do not
delete or replay the marker rows. Rerun a read-only PREFLIGHT/verification and
preserve both receipts. A later defect is corrected through separately
reviewed forward tooling; migration-ledger deletion is not rollback.

## Rollback

Before APPLY, rollback is simply to stop; PREFLIGHT is read-only. After a
successful APPLY, deleting ledger rows would re-enable destructive historical
bodies and is forbidden. Operational rollback means freezing deployment,
preserving the evidence, and shipping a separately reviewed forward
correction if the postflight proves a defect.

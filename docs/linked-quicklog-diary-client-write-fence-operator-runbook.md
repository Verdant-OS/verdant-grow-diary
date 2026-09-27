# Linked Quick Log diary client-write fence operator runbook

This lane delivers exactly one reviewed, already-merged production migration:

- Version: `20260927094000`
- File: `20260927094000_linked_quicklog_diary_client_write_fence.sql` (#1741)
- SHA-256: `DB09A0C9CDA6C1A1933E9C1DA919B45E1288030DD866C51529A02B9C434C8F7F`
- Project: `knkwiiywfkbqznbxwqfh`
- Branch: `verdant-grow-diary`
- Environment: `verdant-production-solo-founder`
- Workflow: `.github/workflows/apply-linked-quicklog-diary-client-write-fence.yml`

This workflow is not a generic SQL runner. It refuses another migration file,
byte hash, commit, branch, project, repository, catalog shape or actor. Its
disposable PostgreSQL 15 proof is
`.github/workflows/linked-diary-delivery-pg15.yml`. Passing that proof does
not establish production applied state.

## Effect and blast radius

The migration is self-transactional and adds two **restrictive** authenticated
policies on `public.diary_entries`, one invoker trigger function, and one
`BEFORE UPDATE` trigger. Client inserts with linked Quick Log keys, direct
updates of linked rows, and direct deletes of linked rows are rejected.
Ordinary owner diary rows retain their existing path. The canonical Quick Log
revision RPC can continue to update both histories as the server principal.
No existing row is rewritten, deleted, or backfilled. No Action Queue, device,
payment, or Edge object is touched.

The runner checks existing diary owner policies, `details`/`photo_url`
types, RLS, client roles, the measured production migration-ledger shape, and
absence or exact canonical presence of the four target objects. A partial
state blocks. The read-only PREFLIGHT receipt binds the catalog result to the
exact deploy SHA and migration hash. APPLY rechecks it, runs the migration
byte-for-byte through plain `psql --file`, verifies the canonical objects,
then inserts only this migration's ledger row in a separate short transaction.
If the schema committed but the ledger step failed, a fresh PREFLIGHT can
classify `schema_live_ledger_absent` for ledger-only recovery.

## Protected environment

Require the solo founder `cheekhimself` (GitHub user ID `72639960`) as
the sole environment reviewer, self-review allowed, admin bypass off, and
the single deployment branch rule `verdant-grow-diary`. Environment secrets
`SUPABASE_DB_URL` and `SUPABASE_DB_CA_CERT_B64` must refer to the pinned
production project. The workflow checks the actual approval and environment
configuration, then uses the pinned PostgreSQL client and `sslmode=verify-full`.
Do not copy a sandbox URL or certificate into this environment.

All production migration writers use the
`verdant-production-migration-writer` concurrency group. Before either
dispatch, verify no other writer is queued, in progress, waiting, pending,
or requested. The workflow repeats that check before database access. The
registered writers are:

- `apply-candidate-number-maintenance-migrations.yml`
- `apply-pinned-breeding-reconciliation.yml`
- `apply-pinned-production-migrations.yml`
- `apply-quicklog-corrections-retractions.yml`
- `apply-signup-acquisition-forward-repair.yml`
- `apply-quicklog-manual-delegate-forward-repair.yml`
- `apply-action-queue-transition-forward-repair.yml`
- `apply-agreement-acceptance-insert-forward-repair.yml`
- `apply-quicklog-revision-idempotent-replay.yml`
- `apply-plants-health-unassessed-default.yml`
- `apply-linked-quicklog-diary-client-write-fence.yml`

## Dispatch sequence — founder only, after merge and independent review

1. Confirm #1741 and this delivery lane have independent PASS reviews on
   their **current** heads and have landed on `verdant-grow-diary`. Recheck
   the deploy SHA, migration hash and current production incident state.
   Do not dispatch from a draft PR branch.
2. Dispatch **PREFLIGHT** from `verdant-grow-diary` with the exact 40-character
   `expected_head_sha`, `confirm_project_ref=knkwiiywfkbqznbxwqfh`,
   empty APPLY-only fields, and acknowledgement
   `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`. Approve the
   protected environment as the founder. Do not rerun an old workflow attempt.
3. Review the sanitized PREFLIGHT report. Only `SAFE_TO_APPLY` or the
   canonical `schema_live_ledger_absent` recovery state may produce an APPLY
   receipt. `already_applied_verified` needs no APPLY. Drift, missing
   prerequisites, an unrecognized ledger, or an unverified receipt is a stop.
4. Record the successful PREFLIGHT run ID, attempt `1`, and lowercase
   artifact SHA-256. Wait at least **15 minutes** and no more than **24 hours**,
   recheck the deploy SHA and active writers, and obtain the founder's explicit
   go/no-go for this exact target and receipt.
5. Only after that authorization, dispatch **APPLY** from the same deploy SHA
   with `confirm_apply=APPLY LINKED QUICKLOG DIARY CLIENT WRITE FENCE`,
   the recorded `preflight_run_id`,
   `expected_preflight_run_attempt=1`,
   `expected_preflight_artifact_sha256`, and the same founder
   acknowledgement. Approve the protected environment again.
6. Retain the sanitized APPLY artifact and run URLs. Require
   `applied_verified` or `already_applied_verified` and an exact ledger
   receipt before calling the migration applied. Then verify the live client
   save/correct/retract/reopen path separately. CI and the frontend
   `version.json` cannot prove applied SQL.

## Failure and rollback

If the migration fails, its own transaction rolls back and no ledger row is
inserted. If a later step fails, dispatch a **new PREFLIGHT**; never rerun an
attempt or delete/edit a migration-ledger row. An exact canonical schema with
absent ledger is recoverable through a new authorized ledger-only APPLY.

There is no automatic destructive rollback. To withdraw the fence after
release, author and independently review a **new forward migration** that
drops only the two added restrictive policies, the added trigger, and its
function, with its own protected delivery lane. Do not edit the historical
migration or execute ad-hoc SQL in production.

HOLD #1250. This runbook itself authorizes no production PREFLIGHT, APPLY,
Publish, device, or Action Queue operation.

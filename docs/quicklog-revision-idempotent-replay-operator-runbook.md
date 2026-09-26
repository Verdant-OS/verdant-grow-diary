# Quick Log revision idempotent replay operator runbook

This runbook delivers exactly one reviewed, already-merged production migration:

- Version: `20260916111000`
- File: `20260916111000_quicklog_revision_idempotent_replay.sql` (merged in #1460)
- SHA-256: `CE6A9DBFB51CAF5CE20256EA0C957F88EC8FD76D6A4047BA6832B25A7933D70C`
- Production project: `knkwiiywfkbqznbxwqfh`
- Deploy branch: `verdant-grow-diary`
- Protected GitHub environment: `verdant-production-solo-founder`
- Workflow: `.github/workflows/apply-quicklog-revision-idempotent-replay.yml`

The workflow is intentionally not a general migration runner. It rejects any
other filename, version, byte hash, repository, branch, commit, project, or
catalog shape.

## Why this lane exists

The deployed client (`src/lib/quickLogRevisionService.ts`) always calls the
keyed overloads `quicklog_correct_entry(p_idempotency_key, …)` and
`quicklog_retract_entry(p_idempotency_key, …)` that this migration adds. A
read-only catalog probe of production on 2026-09-25 found the migration
**not applied**: no `quicklog_revision_idempotency` table, no
`quicklog_revision_apply_once`, and only the legacy unkeyed overloads. Until it
is delivered, Quick Log corrections and retractions from the deployed client
have no matching RPC in production (`inference` from source plus the catalog;
the failing request itself was not replayed).

The same probe measured the prerequisites this lane pins: both legacy
functions' source fingerprints, ABI, owner and grants match
`20260811090000_quicklog_corrections_retractions.sql` exactly.

## What the migration does

Purely additive, inside its own `BEGIN`/`COMMIT`:

- `public.quicklog_revision_idempotency` — internal receipt table, RLS on, no
  policies, no client privileges, `service_role` only.
- `public.quicklog_revision_apply_once(…)` — SECURITY DEFINER helper, EXECUTE
  for its owner only.
- Keyed overloads of `quicklog_correct_entry` and `quicklog_retract_entry` —
  EXECUTE for `authenticated` and `service_role`, never `anon`.

The legacy unkeyed signatures are not touched and keep working.

## Safety boundary

Do not freeze write activity. No application-table lock and no write freeze is
part of this procedure. The migration creates new objects only; the later
ledger step locks only `supabase_migrations.schema_migrations` for a short
transaction.

Do not edit the reviewed SQL, concatenate it with other SQL, add
`--single-transaction`, or use the generic migration runner. The reviewed file
already owns `BEGIN` and `COMMIT` and must be passed byte-for-byte to
`psql --file`. Do not apply it through the Lovable SQL console or any other
out-of-band path: that bypasses this lane's preflight, receipt and ledger.

This procedure does not delete application data, migration history, functions,
or audit evidence. Never delete a ledger row to retry. It performs no device
control and creates no hidden automation.

## Production shape this lane pins (measured 2026-09-25)

Delivery lanes used to pin a three-column `supabase_migrations.schema_migrations`
and NOINHERIT client roles. Production has neither: its ledger has six columns
(`version`, `statements`, `name`, `created_by`, `idempotency_key`, `rollback`)
with `UNIQUE (idempotency_key)`, and `anon`, `authenticated` and `service_role`
are INHERIT roles. Every lane, this one included, now renders the measured shape
from `scripts/lib/supabaseMigrationLedgerShape.mjs`, and every PostgreSQL 15
harness builds its scaffold ledger from the same module. Every privilege check
uses `has_*_privilege`, which already follows role membership. The delivered
ledger row sets only `version`, `name` and `statements`.

## Required solo-founder environment controls

The dedicated `verdant-production-solo-founder` environment must be provisioned
separately before this lane can run. Configure exactly:

1. Exactly one required reviewer: GitHub User `cheekhimself`, numeric user ID
   `72639960`.
2. **Prevent self-review OFF**, so the sole founder can approve the protected
   deployment they dispatched.
3. **administrator bypass OFF**.
4. A custom deployment branch policy containing exactly the branch
   `verdant-grow-diary` and no other policy.
5. Environment secret `SUPABASE_DB_URL` for production project
   `knkwiiywfkbqznbxwqfh`.
6. Environment secret `SUPABASE_DB_CA_CERT_B64`, containing the base64 bytes of
   that production Supabase project's Server root certificate.

This lane uses founder self-review. For every fresh PREFLIGHT or APPLY dispatch
the workflow validates the current run, its approval history, the environment
configuration and its deployment branch policies before artifact
verification, the active-writer guard, secrets, CA handling, installation, or
database access. It requires run attempt `1`, the founder as actor and
triggering actor, exactly one founder approval, and this byte-for-byte
acknowledgement:

`I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

This proves founder identity, intent, provenance, and elapsed time; it is not independent human review.

The runner forces `sslmode=verify-full`, pins the CA beneath `RUNNER_TEMP`, and
rejects a missing, malformed, displaced, symlinked, non-CA, or oversized
certificate. Raw database output, URLs, passwords, rows, and certificate bytes
are excluded from uploaded evidence.

## Mandatory active-writer gate

Every registered production migration writer shares the workflow-level group
`verdant-production-migration-writer` with `cancel-in-progress: false` and
`queue: max`. Immediately before approving and dispatching APPLY, still require
all of these workflows to have no `queued`, `in_progress`, `waiting`,
`pending`, or `requested` run:

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

Run this read-only check from an authenticated GitHub CLI session:

```bash
repo=Verdant-OS/verdant-grow-diary
writers=(
  apply-candidate-number-maintenance-migrations.yml
  apply-pinned-breeding-reconciliation.yml
  apply-pinned-production-migrations.yml
  apply-quicklog-corrections-retractions.yml
  apply-signup-acquisition-forward-repair.yml
  apply-quicklog-manual-delegate-forward-repair.yml
  apply-action-queue-transition-forward-repair.yml
  apply-agreement-acceptance-insert-forward-repair.yml
  apply-quicklog-revision-idempotent-replay.yml
  apply-plants-health-unassessed-default.yml
)
for workflow in "${writers[@]}"; do
  for status in queued in_progress waiting pending requested; do
    gh api "repos/${repo}/actions/workflows/${workflow}/runs?status=${status}&per_page=100" \
      --jq '.workflow_runs[] | [.id,.status,.html_url] | @tsv'
  done
done
```

Every command must return no rows, except the current reviewed APPLY run after
it starts. The APPLY workflow repeats this snapshot through the GitHub API as
defense in depth. Allow no other migration dispatch until APPLY is terminal.

## Dispatch 1: read-only PREFLIGHT

Open **Actions → Apply Quick Log revision idempotent replay → Run workflow**
from `verdant-grow-diary` as a fresh dispatch. Do not use **Re-run jobs**.
Enter:

- `operation`: `PREFLIGHT`
- `expected_head_sha`: the exact reviewed 40-character deploy commit
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: leave empty
- `preflight_run_id`: leave empty
- `expected_preflight_run_attempt`: leave empty
- `expected_preflight_artifact_sha256`: leave empty
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

Approve the `verdant-production-solo-founder` environment as `cheekhimself`.

An APPLY receipt is uploaded only for one of these recoverable states:

- `SAFE_TO_APPLY`: the legacy prerequisites are exact, none of the delivered
  objects exists, and no target ledger identity exists. This is the state
  measured on 2026-09-25.
- `schema_live_ledger_absent`: every delivered object is exact but the ledger
  row is absent, normally because an earlier run committed the migration and
  stopped before the separate ledger transaction.

`already_applied_verified` is a read-only success and creates no receipt.
Every other status is a hard stop, reported with its reason
(`prerequisite_drift`, `schema_drift` or `ledger_drift`). Do not override it.

## Review gate

Before APPLY:

1. Confirm the PREFLIGHT run concluded successfully.
2. In the artifacts of that run, require exactly one non-expired artifact named
   `quicklog-revision-idempotent-replay-preflight-run-<RUN_ID>-attempt-1` and
   record its lowercase `.digest` without the `sha256:` prefix. Never use the
   similarly named `quicklog-revision-idempotent-replay-evidence` artifact.
3. Confirm the deploy branch still points to the same reviewed SHA.
4. Record the PREFLIGHT run ID, its run attempt `1`, and the artifact SHA-256.
5. Wait at least 15 minutes, and no more than 24 hours, after the PREFLIGHT
   completed.
6. Repeat the active-writer check, then create a fresh APPLY dispatch.

## Dispatch 2: APPLY

Dispatch the same workflow from the same exact deploy SHA with:

- `operation`: `APPLY`
- `expected_head_sha`: the same reviewed SHA
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: `APPLY QUICKLOG REVISION IDEMPOTENT REPLAY`
- `preflight_run_id`: the successful reviewed PREFLIGHT run ID
- `expected_preflight_run_attempt`: `1`
- `expected_preflight_artifact_sha256`: the recorded artifact SHA-256
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

The runner then: re-runs the exact state-bound read-only preflight; for
`SAFE_TO_APPLY` submits only the exact migration with plain `psql --file`;
requires a read-only `schema_live_ledger_absent` postflight; inserts only the
collision-guarded ledger row in a separate short transaction; and requires a
final read-only `already_applied_verified` postflight.

If the migration step fails, it rolls back as a whole and no ledger row is
inserted. If the migration commits but a later step fails, run a new
PREFLIGHT; the accepted recovery state is `schema_live_ledger_absent`.

## Evidence and rollback posture

Retain the sanitized APPLY evidence artifact and the GitHub run URLs. A PASS
shows `applied_verified`, the pinned migration version and hash, the exact
deploy SHA, and recovery path `migration_then_ledger` or `ledger_only`.

There is no destructive automatic rollback, and none is needed to restore the
legacy behaviour: the legacy RPCs are untouched. If the new objects must be
withdrawn, prepare a separately reviewed forward migration (for example,
revoking EXECUTE on the keyed overloads). Never delete the ledger row, drop
objects by hand, or edit the merged migration.

## Runtime proof

`scripts/run-quicklog-revision-idempotent-replay-pg15-harness.mjs` runs in
`.github/workflows/quicklog-revision-idempotent-replay-pg15.yml` against a
disposable PostgreSQL 15 service. It builds the production baseline from the
reviewed prerequisite migration and the measured ledger/role shape, then
proves the classification, the apply, the guarded ledger insert and collision,
owner-scoped idempotent replay, rejected requests left unstored, the client
fences, and that every drifted prerequisite, target object, ACL or ledger row
blocks.

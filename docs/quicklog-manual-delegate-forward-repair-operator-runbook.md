# Quick Log manual delegate forward-repair operator runbook

This runbook delivers exactly one reviewed production migration:

- Version: `20260818010000`
- File: `20260818010000_quicklog_manual_delegate_forward_repair.sql`
- SHA-256: `641C033A6453B180505CFB4EEAD8C97EC0C89C7EC0A501A64D4D5B1B71897B1C`
- Production project: `knkwiiywfkbqznbxwqfh`
- Deploy branch: `verdant-grow-diary`
- Protected GitHub environment: `verdant-production`

The workflow is intentionally not a general migration runner. It rejects any
other filename, version, byte hash, repository, branch, commit, project, or
catalog shape.

## Safety boundary

Do not freeze write activity. No application-table lock and no write freeze is
part of this procedure. The migration takes only its narrow advisory
transaction lock while replacing the private function. The later ledger step
locks only `supabase_migrations.schema_migrations` for a short transaction.

Do not run the historical `20260723000000` migration out of order. It replaces
the public wrapper and can bypass the dual-timestamp contract. Do not edit the
reviewed SQL, concatenate it with wrapper SQL, add `--single-transaction`, or
use the generic migration runner. The reviewed file already owns `BEGIN` and
`COMMIT` and must be passed byte-for-byte to `psql --file`.

This procedure does not delete application data, migration history, functions,
or audit evidence. Never delete a ledger row to retry. It performs no device
control and creates no hidden automation.

## Required environment controls

Before dispatch, confirm the `verdant-production` environment has:

1. A required human reviewer.
2. **Prevent self-review** enabled. The person who dispatches PREFLIGHT or
   APPLY must not approve their own `verdant-production` deployment.
3. Environment secret `SUPABASE_DB_URL` for project
   `knkwiiywfkbqznbxwqfh`.
4. Environment secret `SUPABASE_DB_CA_CERT_B64`, containing the base64 bytes of
   the production Supabase Server root certificate.

Verify the required reviewer and Prevent self-review settings in **Settings →
Environments → verdant-production → Deployment protection rules** before both
PREFLIGHT and APPLY. The dispatcher and approving reviewer must record their
distinct GitHub identities in the change ticket. As a read-only cross-check,
run:

```bash
gh api repos/Verdant-OS/verdant-grow-diary/environments/verdant-production \
  --jq '{protection_rules,prevent_self_review}'
```

Do not continue when the required-reviewer rule or `prevent_self_review: true`
cannot be proven.

The runner forces `sslmode=verify-full`, pins the CA beneath `RUNNER_TEMP`, and
rejects a missing, malformed, displaced, symlinked, non-CA, or oversized
certificate. Raw database output, URLs, passwords, rows, and certificate bytes
are excluded from uploaded evidence.

## Mandatory active-writer gate

All six registered production migration writers share the workflow-level group
`verdant-production-migration-writer` with `cancel-in-progress: false` and
`queue: max`. This serializes their complete workflow lifetimes and retains a
durable queue of pending writers instead of replacing an earlier pending run.
Immediately before approving and dispatching APPLY, still require all of these
workflows to have no `queued`, `in_progress`, `waiting`, `pending`, or
`requested` run:

- `apply-candidate-number-maintenance-migrations.yml`
- `apply-pinned-breeding-reconciliation.yml`
- `apply-pinned-production-migrations.yml`
- `apply-quicklog-corrections-retractions.yml`
- `apply-signup-acquisition-forward-repair.yml`
- `apply-quicklog-manual-delegate-forward-repair.yml`

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
)
for workflow in "${writers[@]}"; do
  for status in queued in_progress waiting pending requested; do
    gh api "repos/${repo}/actions/workflows/${workflow}/runs?status=${status}&per_page=100" \
      --jq '.workflow_runs[] | [.id,.status,.html_url] | @tsv'
  done
done
```

Every command must return no rows, except the current reviewed APPLY run after
it starts. The shared group is the cross-workflow mutex. The APPLY workflow also
repeats this point-in-time snapshot through the GitHub API as defense in depth,
covering pre-change runs and detecting an incomplete writer inventory before
database access. Do not manually bypass the shared group or use an out-of-band
writer, and allow no other migration dispatch until APPLY is terminal. Record
the empty command output and the APPLY terminal result in the change ticket.

## Dispatch 1: read-only PREFLIGHT

Open **Actions → Apply Quick Log manual delegate forward repair → Run
workflow** from `verdant-grow-diary` and enter:

- `operation`: `PREFLIGHT`
- `expected_head_sha`: the exact reviewed 40-character deploy commit
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: leave empty
- `preflight_run_id`: leave empty
- `expected_preflight_run_attempt`: leave empty
- `expected_preflight_artifact_sha256`: leave empty

Review both the job summary and sanitized evidence artifact. An APPLY receipt
is uploaded only for one of these recoverable states:

- `SAFE_TO_APPLY`: the defective delegate is exact and no target ledger
  identity exists.
- `schema_live_ledger_absent`: the canonical delegate is exact but the ledger
  row is absent, normally because an earlier run committed the migration and
  stopped before the separate ledger transaction.

`already_applied_verified` is a read-only success but does not create an APPLY
receipt because no write is needed. Every other status is a hard stop. Do not
override a prerequisite, ACL, owner, helper-source, trigger, overload, or
ledger collision failure.

## Review gate

Before APPLY:

1. Confirm the PREFLIGHT run concluded successfully.
2. Confirm its repository, workflow path, branch, exact head SHA, run attempt,
   artifact SHA-256, project ref, migration pin, and state digest. Read the run
   attempt from `gh api repos/Verdant-OS/verdant-grow-diary/actions/runs/RUN_ID`
   and the `sha256:` artifact digest from
   `gh api repos/Verdant-OS/verdant-grow-diary/actions/runs/RUN_ID/artifacts?per_page=100`.
3. Confirm the deploy branch still points to the same reviewed SHA.
4. Record the PREFLIGHT run ID, record its run attempt, and record its artifact
   SHA-256 in the change ticket. A rerun creates a new attempt and requires a
   fresh review; never substitute the latest attempt after review.
5. Obtain the required `verdant-production` environment approval.

The APPLY dispatch authenticates the prior run and artifact through the GitHub
API. A copied JSON file, a different workflow, another attempt, an expired or
multi-file archive, an advanced branch, or a changed database state fails
closed before a write.

## Dispatch 2: APPLY

Dispatch the same workflow from the same exact deploy SHA with:

- `operation`: `APPLY`
- `expected_head_sha`: the same reviewed SHA
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: `APPLY QUICKLOG MANUAL DELEGATE FORWARD REPAIR`
- `preflight_run_id`: the successful reviewed PREFLIGHT run ID
- `expected_preflight_run_attempt`: the exact positive run attempt recorded at
  review
- `expected_preflight_artifact_sha256`: the exact lowercase 64-character
  artifact SHA-256 recorded at review, without the `sha256:` prefix

The runner then performs this sequence:

1. Re-resolves the live `verdant-grow-diary` head before database access.
2. Authenticates the immutable PREFLIGHT artifact.
3. Re-runs the exact state-bound read-only preflight.
4. For `SAFE_TO_APPLY`, submits only the exact migration with plain
   `psql --file` and no outer `--single-transaction`.
5. For either recoverable path, requires a read-only canonical
   `schema_live_ledger_absent` postflight.
6. Inserts only the collision-guarded ledger row in a separate short
   transaction.
7. Requires a final read-only `already_applied_verified` postflight.

If the migration step fails, no ledger row is inserted. If the migration
commits but a later step fails, run a new PREFLIGHT; the only accepted recovery
state is `schema_live_ledger_absent`. If the ledger step commits but the final
verification is interrupted, a new PREFLIGHT must return
`already_applied_verified`. Before any recovery PREFLIGHT or APPLY, repeat the
active-writer check, reconfirm the required reviewer and Prevent self-review,
and again allow no other migration dispatch until APPLY is terminal.

## Evidence and rollback posture

Retain the sanitized APPLY evidence artifact and exact GitHub run URLs. A PASS
must show `applied_verified`, the pinned migration version and hash, the exact
deploy SHA, and either recovery path `migration_then_ledger` or `ledger_only`.

There is no destructive automatic rollback. The replaced private delegate is a
forward repair, while the public wrapper identity, source, owner, ACL, and
service-role posture are asserted unchanged. On an unexpected postflight,
leave the schema and ledger untouched, preserve writes, collect protected
catalog evidence, repeat the active-writer check before any new dispatch, and
prepare a separately reviewed forward repair. Never delete the migration
ledger row or replay an older wrapper migration.

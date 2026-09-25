# Plants health unassessed default operator runbook

This runbook delivers exactly one reviewed production migration:

- Version: `20260924120000`
- File: `20260924120000_plants_health_unassessed_default.sql` (introduced by #1683, BUG-009)
- SHA-256: `B0F6C2717679BD19FA51C1FB1D3CDFC8405739A081C9B1B8D408055E72B9655B`
- Production project: `knkwiiywfkbqznbxwqfh`
- Deploy branch: `verdant-grow-diary`
- Protected GitHub environment: `verdant-production-solo-founder`
- Workflow: `.github/workflows/apply-plants-health-unassessed-default.yml`

The workflow is intentionally not a general migration runner. It rejects any
other filename, version, byte hash, repository, branch, commit, project, or
catalog shape.

**Order of operations.** The migration and the client change that relies on
it arrive with #1683. This lane can only run after #1683 is merged into
`verdant-grow-diary`, because it runs from the deploy branch and pins the
migration's bytes.

## Why this lane exists

QA on 2026-09-24 (BUG-009) found that every new plant was stored with
`health = 'healthy'`, the column default since `20260516204601`. The plant
pages then claimed "Plant health: healthy" for a plant with no logs: a health
claim with no evidence behind it. #1683 fixes the client and adds this migration
so the database default matches: a new plant is `unknown` ("not assessed")
until the grower assesses it.

## What the migration does

Inside its own `BEGIN`/`COMMIT`, and nothing else:

- `public.validate_plant_row()` also accepts `'unknown'`. `CREATE OR REPLACE`
  keeps the function's oid, owner, grants and its `trg_plants_validate` trigger.
- `public.plants.health` defaults to `'unknown'`. The column stays `NOT NULL`.
- `public.plants.health` gets a column comment.

It does not rewrite existing rows. The database cannot tell a grower's explicit
"Healthy" from the old default, so rewriting `'healthy'` rows would erase real
assessments. Growers change any plant's health in Edit Plant.

The #1683 client is safe on both sides of this apply because it writes
`'unknown'` only explicitly. Create Plant sends `'unknown'` for "Not assessed
yet", and Edit Plant sends it only to clear an assessment. Before the apply,
the old trigger rejects either write as a whole, nothing is saved, and the
dialog asks the grower to choose a health value. After the apply, both save.
Guided setup has no health field and omits the column, so the default applies
there: `'healthy'` before the apply, as it always was, and `'unknown'` after.

Until this apply runs, Create Plant refuses "Not assessed yet". Apply it soon
after the #1683 client is published.

## Safety boundary

Do not freeze write activity. No application-table lock and no write freeze is
part of this procedure. `ALTER COLUMN … SET DEFAULT` changes catalog metadata
only; the later ledger step locks only `supabase_migrations.schema_migrations`
for a short transaction.

Do not edit the reviewed SQL, concatenate it with other SQL, add
`--single-transaction`, or use the generic migration runner. The reviewed file
already owns `BEGIN` and `COMMIT` and must be passed byte-for-byte to
`psql --file`. Do not apply it through the Lovable SQL console or any other
out-of-band path: that bypasses this lane's preflight, receipt and ledger.

This procedure does not delete application data, migration history, functions,
or audit evidence. Never delete a ledger row to retry. It performs no device
control and creates no hidden automation.

## What the preflight requires

Prerequisites, before and after delivery:

- the measured migration-ledger and client-role shape
  (`scripts/lib/supabaseMigrationLedgerShape.mjs`);
- `public.plants` is a plain table with RLS on, owned by `postgres`;
- `trg_plants_validate` is the enabled `BEFORE INSERT OR UPDATE … FOR EACH ROW`
  trigger calling `validate_plant_row()`;
- `plants.health` is plain `text NOT NULL`;
- exactly one `public.validate_plant_row`, a non-SECURITY DEFINER plpgsql
  trigger function with `search_path=public`;
- **nothing else guards health values**: no CHECK constraint on `health`, no
  other plants trigger whose function mentions health, and no plants policy
  whose expression mentions health. Any of those could reject `'unknown'`, and
  every insert that omits health would then fail. The preflight reports this as
  `prerequisite_drift` with reason `health_guard_drift_count`.

Target states:

- `SAFE_TO_APPLY`: the legacy function body (297 bytes, md5
  `b58d8cc95ea0c85a9c18045fa77123b1`), `DEFAULT 'healthy'::text`, no delivered
  comment, no ledger row.
- `schema_live_ledger_absent`: the delivered body (307 bytes, md5
  `1a2dc73c88871084508ece97352abcb5`), `DEFAULT 'unknown'::text` and the
  delivered comment, but no ledger row.

`validate_plant_row()`'s ACL is read and bound into the receipt digest. The
apply must leave it exactly as the reviewed PREFLIGHT observed it; otherwise the
lane stops before recording the ledger.

Production's actual state for this lane is `NOT_MEASURED` so far: the
production SQL tool was unavailable when the lane was written. The first
PREFLIGHT is the measurement.

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

Open **Actions → Apply plants health unassessed default → Run workflow** from
`verdant-grow-diary` as a fresh dispatch. Do not use **Re-run jobs**. Enter:

- `operation`: `PREFLIGHT`
- `expected_head_sha`: the exact reviewed 40-character deploy commit
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: leave empty
- `preflight_run_id`: leave empty
- `expected_preflight_run_attempt`: leave empty
- `expected_preflight_artifact_sha256`: leave empty
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

Approve the `verdant-production-solo-founder` environment as `cheekhimself`.

An APPLY receipt is uploaded only for `SAFE_TO_APPLY` or
`schema_live_ledger_absent` (see above). `already_applied_verified` is a
read-only success and creates no receipt. Every other status is a hard stop,
reported with its reason (`prerequisite_drift`, `schema_drift` or
`ledger_drift`). Do not override it. A `health_guard_drift_count` stop needs its
own reviewed fix first; do not drop a constraint, trigger or policy by hand.

## Review gate

Before APPLY:

1. Confirm the PREFLIGHT run concluded successfully.
2. In the artifacts of that run, require exactly one non-expired artifact named
   `plants-health-unassessed-default-preflight-run-<RUN_ID>-attempt-1` and
   record its lowercase `.digest` without the `sha256:` prefix. Never use the
   similarly named `plants-health-unassessed-default-evidence` artifact.
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
- `confirm_apply`: `APPLY PLANTS HEALTH UNASSESSED DEFAULT`
- `preflight_run_id`: the successful reviewed PREFLIGHT run ID
- `expected_preflight_run_attempt`: `1`
- `expected_preflight_artifact_sha256`: the recorded artifact SHA-256
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

The runner then:

1. re-runs the exact state-bound read-only preflight;
2. for `SAFE_TO_APPLY`, submits only the exact migration with plain
   `psql --file`;
3. requires a read-only `schema_live_ledger_absent` postflight with
   `validate_plant_row()`'s ACL unchanged;
4. inserts only the collision-guarded ledger row in a separate short
   transaction;
5. requires a final read-only `already_applied_verified` postflight.

If the migration step fails, it rolls back as a whole and no ledger row is
inserted. If the migration commits but a later step fails, run a new
PREFLIGHT; the accepted recovery state is `schema_live_ledger_absent`. Every
statement in the migration is idempotent, and the harness proves a replay
changes nothing, but recovery never replays it.

## Evidence and rollback posture

Retain the sanitized APPLY evidence artifact and the GitHub run URLs. A PASS
shows `applied_verified`, the pinned migration version and hash, the exact
deploy SHA, and recovery path `migration_then_ledger` or `ledger_only`.

There is no destructive automatic rollback. If the default must be withdrawn,
prepare a separately reviewed forward migration (for example
`ALTER COLUMN health SET DEFAULT 'healthy'`). That would bring back BUG-009 for
new plants. Never delete the ledger row, alter objects by hand, or edit the
merged migration.

## Runtime proof

`scripts/run-plants-health-unassessed-default-pg15-harness.mjs` runs in
`.github/workflows/plants-health-unassessed-default-pg15.yml` against a
disposable PostgreSQL 15 service. It builds the production baseline from the
reviewed `20260516204601` migration, Supabase-style default grants and the
measured ledger/role shape, then proves:

- the classification in each state;
- before the apply, a grower's new plant that omits health (signed in, under
  RLS) is `healthy`, and an explicit `'unknown'` is rejected;
- after the apply, a new plant is `unknown`, "not assessed" saves, invalid
  values are still rejected and existing rows are unchanged;
- the function keeps its oid and grants;
- the guarded ledger insert and its collision;
- an idempotent replay;
- a detected ACL change;
- every drifted prerequisite, health guard, target object or ledger row blocks.

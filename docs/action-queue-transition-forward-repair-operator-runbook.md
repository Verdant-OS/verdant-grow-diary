# Action Queue transition forward-repair operator runbook

This runbook delivers exactly one reviewed production migration:

- Version: `20260819190852`
- File: `20260819190852_action_queue_transition_forward_repair.sql`
- SHA-256: `FB887C43BE86AFFC39E59C2113E1D627053A6058E2B8DE06A6571D9F34F66C49`
- Production project: `knkwiiywfkbqznbxwqfh`
- Deploy branch: `verdant-grow-diary`
- Protected GitHub environment: `verdant-production-solo-founder`

The workflow is intentionally not a general migration runner. It rejects any
other filename, version, byte hash, repository, branch, commit, project, or
catalog shape.

## Safety boundary

Do not freeze write activity. No application-table lock and no write freeze is
part of this procedure. The migration takes only its narrow advisory
transaction lock while converging the transition function, policies, grants,
and decision-field guard. The later ledger step
locks only `supabase_migrations.schema_migrations` for a short transaction.

Do not manually run the historical `20260726093000` and `20260726094000`
migrations out of order. The forward repair recognizes only the exact measured
legacy or already-contracted catalog and converges either one to the reviewed
server-enforced contract. Do not edit the reviewed SQL, concatenate it with
additional SQL, add `--single-transaction`, or use the generic migration runner.
The reviewed file already owns `BEGIN` and `COMMIT` and must be passed
byte-for-byte to `psql --file`.

This procedure performs no application-row DML, data backfill, device control,
automatic approval, or hidden automation. It intentionally replaces exact RLS
policies and revokes direct authenticated/anonymous UPDATE and DELETE
privileges. Never delete a ledger row or audit event to retry.

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

Do not rely on GitHub auto-creating the environment. The legacy
`verdant-production` environment has a known-mismatched secret; do not copy it.
Obtain and verify the URL for project `knkwiiywfkbqznbxwqfh` and its CA
independently, then configure them directly on
`verdant-production-solo-founder`. The legacy environment and its other
production writers remain unchanged.

This lane uses founder self-review. For every fresh PREFLIGHT or APPLY dispatch,
the workflow projects and validates four read-only GitHub API resources before
artifact verification, the active-writer guard, secrets, CA handling,
installation, or database access:

- the current run;
- the current run's approval history;
- `verdant-production-solo-founder` configuration; and
- its exact deployment branch-policy collection with `per_page=100`.

It requires current `run_attempt` `1`, founder actor and triggering actor,
exactly one founder approval for the dedicated environment, the exact reviewer
policy above, and this byte-for-byte acknowledgement:

`I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

Raw API responses, tokens, approval comments, database URLs, certificate bytes,
and secrets are excluded from logs and uploaded evidence. Missing, malformed,
ambiguous, paginated, or overflowing evidence fails closed.

This proves founder identity, intent, provenance, and elapsed time; it is not independent human review.

The runner forces `sslmode=verify-full`, pins the CA beneath `RUNNER_TEMP`, and
rejects a missing, malformed, displaced, symlinked, non-CA, or oversized
certificate. Raw database output, URLs, passwords, rows, and certificate bytes
are excluded from uploaded evidence.

## Mandatory active-writer gate

All seven registered production migration writers share the workflow-level group
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
- `apply-action-queue-transition-forward-repair.yml`

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

Open **Actions → Apply Action Queue transition forward repair → Run
workflow** from `verdant-grow-diary` as a fresh dispatch. Do not use **Re-run
jobs**; both PREFLIGHT and APPLY must be fresh `workflow_dispatch` runs at
attempt `1`. Enter:

- `operation`: `PREFLIGHT`
- `expected_head_sha`: the exact reviewed 40-character deploy commit
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: leave empty
- `preflight_run_id`: leave empty
- `expected_preflight_run_attempt`: leave empty
- `expected_preflight_artifact_sha256`: leave empty
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

Approve the `verdant-production-solo-founder` environment as `cheekhimself`.
The workflow rejects a rerun, a different dispatcher or triggering actor, an
altered acknowledgement, an ambiguous approval history, or changed environment
protection before any database process starts.

Review both the job summary and sanitized evidence artifact. An APPLY receipt
is uploaded only for one of these recoverable states:

- `SAFE_TO_APPLY`: the exact accepted legacy or contracted input catalog is
  present and no target ledger identity exists.
- `schema_live_ledger_absent`: the canonical transition function, guard,
  policies, grants, and direct-mutation fences are exact but the ledger row is
  absent, normally because an earlier run committed the migration and stopped
  before the separate ledger transaction.

`already_applied_verified` is a read-only success but does not create an APPLY
receipt because no write is needed. Every other status is a hard stop. Do not
override a table, column, lineage, role, policy, privilege, ACL, owner,
function-source, guard-trigger, overload, or ledger collision failure.

## Review gate

Before APPLY:

1. Confirm the PREFLIGHT run concluded successfully.
2. Confirm its repository, workflow path, branch, exact head SHA, run attempt,
   artifact SHA-256, project ref, migration pin, and state digest. Read the run
   attempt from `gh api repos/Verdant-OS/verdant-grow-diary/actions/runs/RUN_ID`.
   In the artifacts response from
   `gh api repos/Verdant-OS/verdant-grow-diary/actions/runs/RUN_ID/artifacts?per_page=100`,
   require exactly one non-expired artifact named
   `action-queue-transition-forward-repair-preflight-run-<RUN_ID>-attempt-1`,
   replacing `<RUN_ID>` with the numeric run ID, and record its lowercase
   `.digest` value without the `sha256:` prefix. Never use the similarly named
   `action-queue-transition-forward-repair-evidence` artifact: it is sanitized
   operator evidence, not the immutable receipt authenticated by APPLY.
3. Confirm the deploy branch still points to the same reviewed SHA.
4. Record the PREFLIGHT run ID, its exact prior run attempt `1`, and the exact
   lowercase artifact SHA-256 in the change ticket. Never substitute another
   attempt or replacement archive after review.
5. Wait at least 15 minutes after the authenticated PREFLIGHT completion time
   before creating the APPLY dispatch. APPLY must be created no more than
   24 hours after that completion time. Queue or environment-wait time does not
   satisfy the 15-minute minimum; the review window has a 24-hour maximum.
6. Confirm the seven-writer inventory is still idle, then create a fresh APPLY
   dispatch at attempt `1` and approve `verdant-production-solo-founder` as the
   founder.

The APPLY dispatch authenticates the prior run and artifact through the GitHub
API. A copied JSON file, a different workflow, another attempt, an expired or
multi-file archive, an advanced branch, or a changed database state fails
closed before a write.

An interval below 15 minutes or above 24 hours is rejected. An expired review,
rerun, failed authorization, or ambiguous result requires a fresh PREFLIGHT and
a later fresh APPLY dispatch; do not rerun either protected job in place.

## Dispatch 2: APPLY

Dispatch the same workflow from the same exact deploy SHA with:

- `operation`: `APPLY`
- `expected_head_sha`: the same reviewed SHA
- `confirm_project_ref`: `knkwiiywfkbqznbxwqfh`
- `confirm_apply`: `APPLY ACTION QUEUE TRANSITION FORWARD REPAIR`
- `preflight_run_id`: the successful reviewed PREFLIGHT run ID
- `expected_preflight_run_attempt`: the exact positive run attempt recorded at
  review, which must be `1`
- `expected_preflight_artifact_sha256`: the exact lowercase 64-character
  artifact SHA-256 recorded at review, without the `sha256:` prefix
- `solo_founder_acknowledgement`: `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`

The protected workflow and runner then perform this sequence:

1. Validate the current founder identity, exact acknowledgement, attempt `1`,
   environment configuration, branch policy, and approval through the four
   projected API resources.
2. Authenticate the immutable prior PREFLIGHT run ID, attempt, artifact digest,
   founder identity, and inclusive 15-minute-to-24-hour review window.
3. Prove the exact seven-writer inventory idle.
4. Require the dedicated environment's production URL and CA, then re-resolve
   the live `verdant-grow-diary` head before database access.
5. Revalidate the fixed nine-field authorization evidence before the runner
   reads the database URL or can spawn `psql`.
6. Re-run the exact state-bound read-only preflight.
7. For `SAFE_TO_APPLY`, submit only the exact migration with plain
   `psql --file` and no outer `--single-transaction`.
8. For either recoverable path, require a read-only canonical
   `schema_live_ledger_absent` postflight.
9. Insert only the collision-guarded ledger row in a separate short
   transaction.
10. Require a final read-only `already_applied_verified` postflight.

If the migration step fails, no ledger row is inserted. If the migration
commits but a later step fails, run a new PREFLIGHT; the only accepted recovery
state is `schema_live_ledger_absent`. If the ledger step commits but the final
verification is interrupted, a new PREFLIGHT must return
`already_applied_verified`. Before any recovery PREFLIGHT or APPLY, repeat the active-writer check
and dedicated environment contract, then use a fresh
dispatch at attempt `1` with a fresh founder approval. Never rerun a protected
job in place, and again allow no other migration dispatch until APPLY is
terminal.

## Evidence and rollback posture

Retain the sanitized APPLY evidence artifact and exact GitHub run URLs. A PASS
must show `applied_verified`, the pinned migration version and hash, the exact
deploy SHA, and either recovery path `migration_then_ledger` or `ledger_only`.

There is no destructive automatic rollback. The transition function and
database-enforced approval/audit fences are a forward security repair. On an
unexpected postflight, leave application rows and the ledger untouched,
preserve writes, collect protected catalog evidence, repeat the active-writer
check before any new dispatch, and prepare a separately reviewed forward
repair. Never delete the migration ledger row, restore direct client mutation,
or replay the older transition migrations out of order.

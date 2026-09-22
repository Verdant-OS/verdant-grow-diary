# Production environment routing and schedule retirement

ENV-RETIRE-001, 2026-09-15. Repository routing change only; no production operation
or environment-setting change is authorized by this document.

The owner identified `verdant-production` as hollow. That is an owner-reported
operational fact, not a fresh inspection of its secrets or database. This change
removes its three cron triggers and routes four existing migration writers to
`verdant-production-solo-founder`.

## Which environment does what?

| Environment                       | Role after this change                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-production-solo-founder` | Existing protected production delivery environment, now also selected by the four legacy writers below.                                      |
| `verdant-production`              | Legacy manual read-check bindings remain. Its three daily monitoring schedules are retired. It is not deleted or repopulated by this change. |
| `verdant-sandbox`                 | Separate sandbox verification lane. Production routing does not repair or apply sandbox migrations.                                          |
| `Preview` / `Production`          | Other deployment environment names are unchanged; their settings and deployment targets were not inspected here.                             |

A GitHub environment selects job protections and secret scope. Its name does not
prove database identity. The existing writer scripts still validate the pinned
production target and the dispatch confirmations; those checks are unchanged.

## Retired schedules

| Workflow                                | Removed UTC schedule | Remaining trigger       |
| --------------------------------------- | -------------------- | ----------------------- |
| `migration-drift-probe.yml`             | 07:00 daily          | Guarded manual dispatch |
| `money-migration-drift-alert.yml`       | 07:30 daily          | Guarded manual dispatch |
| `ai-credit-service-contract-effect.yml` | 08:00 daily          | Guarded manual dispatch |

The manual jobs retain their deploy-branch restriction, protected secret guard,
verifier and evidence/issue reconciliation. A missing credential still blocks
verification. Removing a schedule does not resolve a drift alert or measure a
healthy database: monitoring is **NOT_MEASURED** until an authorized successful
target-specific check supplies a receipt. Existing alerts are not closed by this PR.

Do not restore these cron triggers against an approval-gated writer environment.
Any future unattended monitoring lane needs a separately approved read-only
environment, target identity and operating owner. Restoring schedules is a separate
reviewed change, not part of this retirement.

## Repointed writers

All four apply jobs now select `verdant-production-solo-founder`:

| Workflow                                            | Existing runner                                             | Existing confirmation                           |
| --------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `apply-pinned-production-migrations.yml`            | `scripts/apply-pinned-production-migrations.mjs`            | `APPLY PINNED PRODUCTION MIGRATIONS`            |
| `apply-candidate-number-maintenance-migrations.yml` | `scripts/apply-candidate-number-maintenance-migrations.mjs` | `APPLY CANDIDATE NUMBER MAINTENANCE MIGRATIONS` |
| `apply-pinned-breeding-reconciliation.yml`          | `scripts/apply-pinned-breeding-reconciliation.mjs`          | `APPLY PINNED BREEDING RECONCILIATION`          |
| `apply-quicklog-corrections-retractions.yml`        | `scripts/apply-quicklog-corrections-retractions.mjs`        | `APPLY QUICKLOG CORRECTIONS RETRACTIONS`        |

Their fixed migration allowlists, SQL, branch/SHA/project confirmations, secret
guards and shared `verdant-production-migration-writer` concurrency group are
unchanged. The group name deliberately stays the same so already-routed writers
and these four writers still serialize together. `cancel-in-progress: false` and
`queue: max` also remain. Repointing adds no new migration to any writer.

Quick Log still requires its authenticated PREFLIGHT receipt for APPLY, a current
deploy-head recheck and certificate/hostname verification using
`SUPABASE_DB_CA_CERT_B64`. Its CA cleanup and sanitized evidence remain intact.
The other existing solo-founder delivery workflows and their authorization helper
are unchanged; this PR does not extend or weaken that authorization model.

## Owner steps before any future production run

1. Complete independent review and merge the exact repository change. A merge of
   this routing change is not permission to run a writer or evidence of deployment.
2. The environment owner verifies the existing
   `verdant-production-solo-founder` branch restrictions, required-reviewer
   protections and private configuration. This PR does not provision settings or
   secrets. A missing prerequisite stays BLOCKED; never add an unprotected secret
   fallback to make a workflow pass.
3. Obtain a separate named production operation authorization. Select only its
   existing dedicated workflow, the exact current `verdant-grow-diary` SHA, the
   pinned project confirmation and that workflow's confirmation phrase. Never use
   one of these workflows as a generic SQL runner.
4. For Quick Log, obtain and review the required successful PREFLIGHT receipt
   before its separately authorized APPLY. Preserve the workflow's receipt, target,
   freshness, TLS and exact-head checks. No PREFLIGHT or APPLY is run by this PR.
5. Retain the resulting sanitized run receipt with target identity, SHA, operation,
   migration/effect result and unresolved gates. Source presence, frontend identity,
   local tests, sandbox results and skipped production jobs do not establish
   production acceptance.

## Remaining references and holds

The three manual monitors above, `prefix-diff-sarif.yml`,
`required-money-migrations.yml`, `required-core-migrations.yml`,
`signup-attribution-cta-readiness.yml` and
`verify-candidate-number-migration-status.yml` still reference
`verdant-production`. Their bindings and trust boundaries are outside this slice.
Do not delete that environment object on the strength of this change. Any further
retirement requires a new inventory and owner decision for those manual read paths.

HOLD #1250 remains. It shares the migration/money monitor file paths but owns
preflight diagnostics. This change neither imports its implementation nor changes
its branch; its owner must reconcile future operator guidance with this runbook
when that held work resumes. Production inspection, Publish, SQL APPLY, device
control and Action Queue operations remain governed by their existing owner locks.

## Verification and rollback

`src/test/production-environment-retirement.test.ts` parses effective YAML to check
the retired triggers, all four writer bindings, shared serialization, dispatch-only
entry, pinned checkout, secret wiring and matching operator guidance. Existing
monitor, migration-runner and Quick Log TLS/receipt tests remain applicable.

If routing must be reverted, use a separately reviewed repository change and retain
all existing guards. Do not silently restore the retired schedules or treat their
absence as a successful monitoring result.

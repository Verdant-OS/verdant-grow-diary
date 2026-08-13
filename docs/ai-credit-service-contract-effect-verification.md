# AI-credit service contract effect verification

## Purpose

`supabase_migrations.schema_migrations` proves that a migration version was recorded as
applied. It does not prove that a later export did not replace a function body or restore
unsafe privileges. The production effect monitor therefore measures migration history and
current contract state independently.

The monitor is read-only. It reads PostgreSQL catalogs, `pg_get_functiondef`, migration
history, and effective privileges. It never invokes a money function and never changes the
database.

## Exact targets

The verifier resolves complete identity signatures rather than function names:

- `public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)`
- `public.ai_credit_refund(uuid,uuid,text,text)`

Other legacy overloads may exist during the documented rollback window. They do not make
these exact targets ambiguous. Each exact identity signature must resolve to exactly one
catalog object. A missing target or any non-unique exact resolution fails closed.

## What is compared

Raw definition equality is intentionally not used. PostgreSQL may reformat definitions,
and a later forward migration may safely strengthen the contract. The verifier removes
comments, folds unquoted SQL case, and collapses whitespace, while preserving quoted
values. It then checks named money/security invariants derived from
`20260727050000_ai_credit_service_contract_forward_reassert.sql`, including:

- service-role-only execution, `SECURITY DEFINER`, and a pinned `public, pg_temp` search path;
- server-selected user, billing environment, feature, model tier, and result handling;
- user serialization, grow ownership before replay, and context-bound idempotency;
- append-only result caching and refusal to replay refunded spends;
- Craft allowance recognition, allowance-first grant overflow, and funding provenance;
- user-bound, idempotent, append-only negative refunds that preserve the original funding source;
- read-only service access to `ai_credit_spend_results`, with browser and direct service writes revoked.

The later `20260728090736_ai_credit_pack_portability.sql` spend body is accepted because it
preserves these invariants while strengthening environment isolation and receipt replay.
The stale `20260721190058` export fails the semantic checks even if migration history says
the forward reassertion ran.

## Status contract

The JSON audit always carries four separate fields. Boolean `null` means unknown, never
healthy.

| Field                       | `true`                                                            | `false`                                                                           | `null`                              |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| `migration_applied`         | Version `20260727050000` is recorded                              | Version is not recorded                                                           | The migration tracker was not read  |
| `contract_effective`        | Every body, metadata, and privilege check passed                  | At least one measured check failed                                                | Effect could not be fully inspected |
| `definition_drift_detected` | A target/body/definition invariant failed                         | Definition checks passed; privilege drift may still make the contract ineffective | Definitions could not be read       |
| `verification_blocked`      | Access, tooling, query, or readability blocked a complete verdict | The verification completed                                                        | Not used                            |

Examples that must remain distinguishable:

- applied `true`, effective `false`, drift `true`: migration ran, but a function contract changed;
- applied `true`, effective `false`, drift `false`: bodies are sound, but privileges drifted;
- applied `false`, effective `true`, drift `false`: current bodies happen to be sound, but migration history is incomplete;
- applied `null`, effective `null`, drift `null`, blocked `true`: no production conclusion is authorized.

## Running it

The scheduled workflow `.github/workflows/ai-credit-service-contract-effect.yml` runs at
08:00 UTC from the trusted deploy branch, after the separate 07:30 migration-presence
monitor. It uses the protected `verdant-production` environment and that environment's
existing `SUPABASE_DB_URL` secret. The verifier independently pins `TARGET_ENV=live` and
rejects a connection whose project identity does not match Verdant production.

For an authorized local read:

```text
TARGET_ENV=live
SUPABASE_DB_URL=<production pooled Postgres URL>
AUDIT_PATH=artifacts/ai-credit-effect/audit.json
REPORT_PATH=artifacts/ai-credit-effect/report.md
node scripts/verify-ai-credit-service-contract-effect.mjs
```

Do not paste the URL into command arguments, logs, reports, issue bodies, or repository
files. The verifier passes sanitized connection fields to `psql` through the process
environment, suppresses raw database diagnostics, and persists only statuses, named check
failures, and SHA-256 hashes of normalized definitions. Raw function definitions are kept
in memory only.

## Responding to failure

1. Treat `verification_blocked: true` as unknown production state, not drift and not a pass.
2. If `migration_applied` is false, use the existing migration-application runbook and
   authorized production workflow. Do not apply SQL from this verifier.
3. If definition drift is detected, compare the current live definition with the latest
   committed forward contract and identify the later writer.
4. If only privileges fail, inspect function/table grants separately from the bodies.
5. Never edit the published `20260727050000` migration. Repair confirmed drift with a new,
   additive forward migration and the normal security/runtime review.

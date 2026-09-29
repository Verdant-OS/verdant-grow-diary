# Production-only verification runbook

Decision: Matthew, 2026-09-28, CHEM-INVENTORY-REPAIR-001 sections 8–9.
This is docs-only policy/plan. It dispatches no job and changes no CI.

## Fixture identity

The assigned smoke account is cheekhimself@gmail.com. Never use
matt@verdantgrowdiary.com or the KEEP account. Verify account and fixture
ownership before a write; the email alone does not grant scope.

## Target and safety

Hosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep
E2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the
disposable test account owns the fixture grow and its selected tent/plant;
tag every saved grow record `[smoke <timestamp>]`. Never write customer data or
use the KEEP account. Stop a write if identity, ownership or tagging cannot
be verified; report that exact safety gap rather than proposing another host.
Local/CI fixtures validate code, not production. Repository integration follows
the explicit merge phases in AGENTS.md; it is not production acceptance. No
Publish, production APPLY, real charge, role/auth change, device control or
Action Queue operation is authorized here. Existing owner locks remain.
See docs/production-only-verification-runbook.md.

The old verdantgrowdiary-com.lovable.app returned 404 in the recorded run.
Its replacement is production; lack of a non-production smoke host is not a
blocker. A remembered target does not prove scope. Read account/grow/tent/plant
relationships before a write and read the tagged record back in that grow's
Timeline. Do not seed/delete production users, grant roles or entitlements,
create charges or repoint a privileged fixture seeder at production.

## Exact receipt

Record UTC time, repository head, independently read frontend identity, account
classification (no credentials), fixture scope, smoke tag, save/readback,
exact counts and run/artifact links. Use PASS / FAIL / BLOCKED / NOT_MEASURED /
NOT_APPLICABLE per axis. Source presence, frontend SHA, skipped production jobs
and CI cannot establish applied schema, Edge deployment or live save/retrieve.

Independent acceptance routing: **Blue Dream** reviews any .tsx file,
P1s and publish gates; **Critical Mass** reviews everything else. An author cannot
give its own work an independent PASS. Claude may add peer observations but is not
the acceptance reviewer. Matthew's Phase 1 exception permits Codex to integrate
its own low-risk PRs through the PR flow after every required check is SUCCESS
at the exact head SHA. High-risk work remains draft for GDP review and merge;
publish gates remain with Matthew. Phase 2 requires Matthew's explicit confirmation
that CI is proven. Historical receipts keep their original reviewer.

## Existing non-production dependencies — separate CI slices

These are source bindings, not successful target inspection. No job, trigger,
environment, secret reference, script or protection changes here. Do not
substitute a production URL into a legacy mutation harness.

| Existing lane                              | Existing source binding                                                                        | Separate follow-up / status                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Preview (provider)                | Preview migration replay; #1175 reports 42P07, ai_credit_grants exists                         | BLOCKED: SQL/provider reconciliation outside this repair scope; no production acceptance.                                           |
| Required core schema present               | required-core-migrations.yml, verify-sandbox, verdant-sandbox, SUPABASE_DB_URL_SANDBOX         | BLOCKED CI alignment: separate protected production identity/read-only lane; retain current/offline jobs.                           |
| Required money-critical migrations present | required-money-migrations.yml, verify-sandbox, verdant-sandbox, SUPABASE_DB_URL_SANDBOX        | BLOCKED CI alignment: separate protected read-only lane; APPLY remains Matthew's approval.                                          |
| Prefix diff against SANDBOX                | prefix-diff-sarif.yml, prefix-diff-sandbox, sandbox DB secret                                  | BLOCKED CI alignment: separately review target/receipt contract; no production inference.                                           |
| Sandbox credit-packs smoke                 | sandbox-credit-packs-smoke.yml, nightly sandbox DB read, scripts/sandbox-credit-packs-smoke.ts | BLOCKED CI alignment: propose fixture-scoped production read-only equivalent, no payment-mode change or charge.                     |
| Gamification staging smoke                 | gamification-staging-smoke.yml, main-only privileged setup; recorded step-env gating gap       | BLOCKED CI alignment: effective gating and fixture safety need review before production; no role/credit setup authorized.           |
| Conditional QuickLog RPC harness           | ci.yml, test:db:quicklog-rpc-runtime, privileged DB setup                                      | BLOCKED production smoke: audit fixture/writes separately; never simply repoint setup credentials.                                  |
| Pheno paid-user local smoke                | test:pheno-paid-smoke:local, disposable user/subscription seeding, local-only refusal          | BLOCKED hosted verification: separately assign production-safe fixture lane; never repoint seeder/cleanup.                          |
| Mocked/local browser and DB CI             | Local web-server / disposable fixtures, including Demo Proof/native recovery                   | NOT_APPLICABLE to production acceptance. Preserve code validation jobs; any target changes need a separate CI slice.                |
| deployment-preview                         | Artifact build/upload/status, no hosted target measured                                        | NOT_APPLICABLE to live acceptance. Status-message alignment is a separate CI slice, not a deployment or alternate-host requirement. |

Provider-sandbox accounting and telemetry/CSV/Doctor preview UI are not alternate
smoke hosts. Preserve their semantics; no billing-mode/entitlement/auth/schema
change is authorized by the host decision.

## Rollback

Revert documentation only. Prose does not revert data or authorize another
verification host. No operational rollback was run.

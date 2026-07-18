# AI Credit Billing-Environment Rollout

This change requires two database releases with a verification pause between
them. Do not describe the rollout as a single zero-outage migration.

- **Expand:** add service-only spend/refund overloads while legacy authenticated
  overloads remain available.
- **Verify:** prove both updated edges are using the new overloads after the
  PostgREST schema reload.
- **Contract:** revoke authenticated access to the legacy overloads in a
  separate release.

Supabase `db push` applies every pending file under `supabase/migrations/` in
timestamp order. Therefore the contract SQL is deliberately stored at
`supabase/contract-migrations/ai_credit_server_billing_environment_contract.sql`
and is not auto-applied. Moving it into the normal migration directory before
verification would recreate the outage race this rollout is designed to avoid.

## Preconditions

- Set `PAYMENTS_ENVIRONMENT` explicitly to `sandbox` or `live`. Cost-bearing AI
  fails with a configuration response when it is missing or invalid.
- Confirm `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `LOVABLE_API_KEY` exist in the edge-function secret store.
- Record the current deployed versions of `ai-doctor-review` and `ai-coach`.
- Use disposable test users and idempotency keys for every verification call.
- Pin and record the Supabase CLI version used for both releases.
- Run `supabase migration list` and confirm version `20260718160000` has never
  been applied to the target project. If it already appears remotely, stop:
  changing or renaming that migration will not update the remote database. Put
  the expand SQL in a new timestamped migration instead.

## Release 1: edge and expand

1. Deploy the updated `ai-doctor-review` and `ai-coach` functions.
2. Before the expand migration, make one disposable request through each edge.
   The new overload is absent, so an edge may use the legacy user-scoped RPC
   only after an exact `PGRST202`/`42883` missing-overload match. Permission,
   timeout, validation, and arbitrary database errors fail closed.
3. Run `supabase db push --dry-run`. Confirm the only AI-credit database change
   is
   `supabase/migrations/20260718160000_ai_credit_server_billing_environment_expand.sql`.
   A contract migration must not appear.
4. Apply the expand migration. It creates and grants the service-only overloads,
   leaves legacy grants unchanged, and sends `NOTIFY pgrst, 'reload schema'`.
5. Poll PostgREST with disposable service-role RPC calls for both new overload
   signatures. Treat only exact `PGRST202`/`42883` missing-overload responses as
   "not ready" and retry; stop on every other error. Continue only when both
   overloads resolve. Do not use a fixed sleep. Then run:

   ```bash
   AI_CREDIT_ROLLOUT_PHASE=expand bun run scripts/run-ai-credits-rls-harness.ts
   ```

6. Make one successful request through each updated edge. For each feature,
   verify the new `ai_credit_spends.meta.server_billing_environment` field is
   present and correct. The legacy RPC does not write this field, so this is
   the database receipt proving the edge reached the new overload.
7. Verify a disposable provider failure appends one service-authoritative
   reversal and that repeated/resultless keys never produce a second provider
   call.

## Mandatory verification stop

Do not create or deploy the contract migration until all of these are recorded:

- AI Doctor receipt using the service overload
- AI Coach receipt using the service overload
- expand-phase runtime harness result
- resultless replay/provider-call result
- operator, UTC timestamp, project, and deployed edge versions

If any item is missing, remain in the expand state. Old and new edges can both
operate there, so a forward fix or ordinary edge rollback remains available.

## Release 2: contract

1. Start a separate contract branch/PR only after the verification receipt is
   approved.
2. Copy the reviewed template from
   `supabase/contract-migrations/ai_credit_server_billing_environment_contract.sql`
   into a newly timestamped file under `supabase/migrations/`. Do not edit the
   grant/revoke statements while copying it.
   Its fail-closed preflight verifies that all four expected overloads exist,
   the new overloads are service-only, and the legacy compatibility grants are
   still present before any revoke executes.
3. Run `supabase db push --dry-run` and confirm the new contract migration is the
   only pending AI-credit migration.
4. Apply it, wait for the included PostgREST schema reload, and run the default
   final-state harness:

   ```bash
   bun run scripts/run-ai-credits-rls-harness.ts
   ```

5. Complete the AI-credit section of `docs/paddle-sandbox-smoke.md`. Confirm an
   authenticated token cannot execute either legacy RPC while both edges still
   spend and refund through the service-only overloads.

Do not run the contract template directly in the production SQL editor. The
separate migration preserves Supabase migration history and makes the contract
release reviewable and repeatable.

## State matrix

| Edge version | Database state | Result                                                          |
| ------------ | -------------- | --------------------------------------------------------------- |
| Old          | Before expand  | Existing behavior works                                         |
| New          | Before expand  | Exact missing-overload fallback works                           |
| Old          | Expand         | Legacy path still works; new overloads are additive             |
| New          | Expand         | Service-only path works; verification receipts can be collected |
| New          | Contract       | Final hardened state; legacy authenticated grants revoked       |
| Old          | Contract       | **Blocked**; restore legacy grants before edge rollback         |

## Residual exposure during expand

The expand window intentionally retains the pre-existing authenticated legacy
spend/refund capability. That is the compatibility mechanism that removes the
schema-cache outage race. Keep this interval short, monitor it, and do not claim
the client boundary is fully hardened until the contract release passes. The
new service overloads remain role-checked and cannot be invoked by an
authenticated client during either stage.

Deterministic concurrent replay is guaranteed by the new service overloads and
the final contract state. The unchanged legacy overloads still use their older
optimistic lookup during expand, so a mixed old-edge/new-edge same-key race can
still surface a legacy unique-key RPC error. Updated edges use the service path
once schema discovery succeeds; keep the expand interval short and do not use
the deterministic claim for legacy traffic.

## Rollback

Before contract, edge rollback is ordinary because legacy grants remain. The
expand migration is additive and may safely remain in place.

After contract, do **not** roll an edge back first. Prefer a forward fix. If an
emergency old-edge rollback is unavoidable, first deploy a reviewed migration
containing:

```sql
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, text)
  TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
```

Wait for schema reload, then deploy both previous edges. This deliberately
reopens the legacy client boundary; record the operator, timestamp, and reason.
To re-harden, deploy the updated edges, collect new service-overload receipts,
then reapply the contract template through another timestamped migration.

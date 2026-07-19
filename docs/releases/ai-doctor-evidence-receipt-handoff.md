# AI Doctor evidence receipts — release handoff

This handoff covers the evidence-receipt release added to `ai-doctor-review`.
It is an operational checklist, not deployment authorization. Source tests and
merged code do not prove a target database, Edge Function, or secret store is
ready.

## Release boundary

Work from the exact reviewed, merged commit. Record the commit SHA, target
Supabase project reference, target environment, operator, and timestamps in
the release evidence. Do not infer any of them from a frontend deployment.

The release introduces a private receipt paired atomically with a fresh AI
Doctor result. It must not be deployed half-way: a stale Edge build can create
a cache-only result after the receipt migration, while a new Edge build cannot
finalize safely before the prerequisite migrations and HMAC configuration exist.

## Required configuration

Configure these names in the server-side Edge secret store before deploying the
new function:

- `AI_DOCTOR_RECEIPT_HMAC_KEY` — at least 32 UTF-8 bytes.
- `AI_DOCTOR_RECEIPT_HMAC_KEY_ID` — an operator-managed key identifier.

Rotate the key and key ID together. Record only the key ID and confirmation
that the names are present; never print, commit, paste, or store the key value
in release evidence. The client must never receive either value.

## Mandatory deployment sequence

1. Identify the explicit target and record the currently deployed
   `ai-doctor-review` version.
2. Drain or fence old `ai-doctor-review` traffic. Do not leave a pre-receipt
   Edge build serving fresh reviews while the receipt rollout is in progress.
3. Run a read-only migration-ledger inspection and dry run:

   ```bash
   npx --yes supabase@latest migration list --linked
   npx --yes supabase@latest db push --linked --dry-run
   ```

   Review the complete dry run. It must include the prerequisite result-cache
   migration before the receipt migration:
   1. `20260719043000_ai_credit_result_cache.sql`
   2. `20260719180000_ai_doctor_review_evidence_receipts.sql`

   Stop if the target is wrong, the ledger is unexpected, or the dry run is
   incomplete. Do not use an unreviewed bulk push as a substitute for this
   inspection.

4. After explicit authorization, apply the reviewed migrations and confirm
   PostgREST resolves `ai_doctor_finalize_review`.
5. Deploy the reviewed `ai-doctor-review` Edge source from the recorded commit.
   Deploy the Edge Function before publishing the client that sends receipt
   metadata.
6. On a disposable non-production target, run the protected receipt RLS and
   finalizer harness. It creates and cleans up disposable test users and
   credit-spend rows, so it is never a production smoke test:

   ```bash
   AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS=1 \
   AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS_ALLOW_REMOTE=1 \
   bun run scripts/run-ai-doctor-review-evidence-receipt-rls-harness.ts
   ```

   The remote acknowledgement is valid only for a disposable non-production
   project. Keep the default no-op behavior for every other target.

7. Make one disposable, fresh AI Doctor review through the newly deployed Edge
   Function and verify server-side that it produced exactly one coherent
   result-cache and evidence-receipt pair. Do not put the plant packet, model
   response, receipt payload, or any grower identity into release evidence.
8. Publish the reviewed client only after the Edge finalizer smoke passes, then
   reopen traffic.

## Required evidence and hold conditions

Record only non-sensitive evidence:

| Check                  | Required evidence                                                                 |
| ---------------------- | --------------------------------------------------------------------------------- |
| Target identity        | Project reference, environment, and reviewed commit SHA                           |
| Secret readiness       | Configuration names present and key ID recorded; never a key value                |
| Migration order        | Ledger and dry-run reviewed; both migration IDs recorded in order                 |
| Finalizer availability | `ai_doctor_finalize_review` resolved after schema reload                          |
| Edge parity            | Downloaded or otherwise verified deployed Edge source matches the reviewed commit |
| Receipt behavior       | Disposable smoke confirms one atomic cache-and-receipt pair                       |
| Privacy/RLS            | Non-production harness passes and cleanup is recorded                             |

Keep the release on **HOLD** if any item is absent, if an old Edge build still
serves fresh reviews, if the finalizer is unavailable, or if the non-production
harness cannot clean up. A client build, an HTTP 200, or source-only tests are
not equivalent to this evidence.

## Rollback and recovery

Do not casually roll back to a pre-receipt `ai-doctor-review` Edge build after
the receipt migration. That would again permit cache-only fresh results. Use a
reviewed forward-fix or a deliberate compatibility procedure that preserves the
result/receipt contract, then repeat this handoff from the new reviewed commit.

# Quick Log manual delivery order contract

This is a repository delivery contract and a disposable PostgreSQL 15 proof. It does
not authorize a production PREFLIGHT, APPLY, dispatch, merge, or release. Matthew
decides whether to apply. #1735 remains on hold.

The only accepted sequence is:

1. `20260927002000_quicklog_manual_reuse_fence.sql`
2. `20260927160000_quicklog_manual_plant_tent_lineage.sql`
3. `20260928183000_quicklog_manual_replay_metadata_lock.sql`

`scripts/lib/quicklogManualDeliveryOrder.mjs` rejects any other plan and any step
whose completed prefix differs from that exact order. The PG15 delivery adapter
also checks the immutable SHA-256 of each file before starting its database
process. Failed steps never advance the completed prefix. Migration files remain
unchanged.

The existing manual replay workflow proves this against its attested, loopback-only
PostgreSQL 15 service. It first fingerprints scaffold data and catalog objects,
rejects a reverse-order delivery before starting a database process, then deliberately
attempts `183000` without its parent as a negative control. That SQL must fail and
the database fingerprint must remain identical. It then delivers all three files
in order and checks the resulting wrapper, grants, mixed-grow refusal, zero writes
for refusal, and same-key save/reuse after repairing the assignment.

## Coordination with #1742

At inspected head `114da090a5e2d4ec271563570dfbc84f1546bcf7`, #1742 delivers only
`20260927094000_linked_quicklog_diary_client_write_fence.sql`. It is not a delivery
lane for the three files above. Its existing protections must be retained:

- `verdant-production-migration-writer` concurrency, with cancellation disabled;
- the protected `verdant-production-solo-founder` environment;
- independently reviewed exact candidate and matching PREFLIGHT artifact;
- authenticated target identity, verified TLS, and all production writers idle;
- compatible frontend-delivery evidence and Matthew's separate explicit go/no-go.

A future authorized manual-chain apply adapter must use the shared ordering gate,
reconstruct its completed prefix from authoritative hosted evidence, and retain
those protections. An in-memory test prefix is not proof of hosted migration
history. #1742's branch and production runner are unchanged by this proof PR. No
claim of an operational production manual-chain apply lane is made here.

Run the proof through `.github/workflows/quicklog-manual-reuse-fence-pg15.yml` on
the reviewed candidate. The fixture database is disposable test infrastructure;
passing it does not establish production acceptance or remove #1735's hold.

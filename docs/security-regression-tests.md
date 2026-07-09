# Security Regression Tests

This project has two tiers of security regression coverage.

## `test:security-regression` (required CI)

Runs on every PR (`.github/workflows/security-regression.yml`) as the
required check named **`test:security-regression`**. Order:

1. `bun install --frozen-lockfile`
2. `bun run typecheck` — fail-fast on type errors
3. `bun run test:security-static` — forbids service keys, Paddle/Stripe
   secrets, bridge tokens, and authorization-header logs in `src/`,
   `public/`, and `dist/`
4. `bun run test:payments-security` — Paddle webhook orchestrator,
   event processor, and static "no secret leakage" checks
5. `bun run test:storage-security` — bucket contract + owner-policy
   migration coverage
6. `bun run test:pi-ingest-security` — replay guard + ingest contract doc

This tier is **fully offline**: no network, no database, no Deno runtime.
It must stay fast so it can gate every pull request.

**Manual step (one-time):** after the workflow runs for the first
time, mark `test:security-regression` as a required status check on
`main` in GitHub branch protection.

## `test:security-db-local` (local only)

Full database-backed harnesses. Not wired into required CI because they
need a running local Supabase.

Scripts:

- `bun run test:pi-ingest-db-security` — proves `pi_ingest_commit_batch`
  rejects cross-tent and cross-user replays and creates no
  `sensor_readings` or `action_queue` rows on rejection.
- `bun run test:storage-db-security` — proves diary photo/video buckets
  are owner-scoped and public buckets are read-only for anon.
- `bun run test:security-db-local` — runs both.

### Required local env

Export before running:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...     # test setup only, never logged
```

Start local Supabase first:

```
supabase start
```

If any variable is missing the runner exits with code `2` and a clear
`BLOCKED:` message. It never fakes a pass.

## Security hygiene

- **Never** paste `SUPABASE_SERVICE_ROLE_KEY`, bridge tokens, or Paddle
  webhook secrets into chat, screenshots, or issue comments.
- Test-only fake secrets (e.g. in `paddleSignatureTestHelper`) must be
  obviously fake and never match a real prefix (`pdl_ntfset_`,
  `sk_live_`, `sk_test_`).
- Client bundles must never import the service role key. This is
  enforced by `scripts/security/static-client-secret-scan.mjs`.

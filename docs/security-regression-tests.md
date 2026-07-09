# Security Regression Tests

Three tiers of coverage:

| Tier                              | Required? | Needs local Supabase? | Needs Deno? |
| --------------------------------- | --------- | --------------------- | ----------- |
| `test:security-regression`        | ✅ yes    | no                    | no          |
| `test:paddle-webhook-edge-security` | optional (Deno present) | no          | yes         |
| `test:security-db-local`          | ❌ no (optional job) | yes        | no          |

## Tier 1 — `test:security-regression` (required CI, fully offline)

Runs on every PR via `.github/workflows/security-regression.yml` as the
required check named **`test:security-regression`**.

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test:security-static
bun run test:payments-security
bun run test:storage-security
bun run test:pi-ingest-security
bun run test:security-regression
```

No network, no database, no Deno. Must stay fast so it can gate every PR.

**Manual step (one-time):** mark `test:security-regression` as a required
status check on `main` in GitHub branch protection.

## Tier 2 — `test:paddle-webhook-edge-security` (Deno)

Deno tests against the shared verifier module used by the production
webhook handler (`supabase/functions/paddle-webhook/verifyPaddleSignature.ts`).

```bash
bun run test:paddle-webhook-edge-security
# or directly:
deno test --allow-env supabase/functions/paddle-webhook/security.test.ts
```

Covers: valid signature, missing/malformed header, wrong secret, tampered
body, re-serialised body, tampered `h1`, stale timestamp, future timestamp,
and no-leak assertions on failure reasons.

**No real secrets.** The test file uses an obviously-fake secret
constant and never reads `PADDLE_WEBHOOK_SECRET` from the environment.

## Tier 3 — `test:security-db-local` (optional GitHub job + local dev)

Full database-backed harnesses. Wired into
`.github/workflows/security-db-local.yml` as an **optional** job that
starts local Supabase, applies migrations, and runs the harnesses. It is
`continue-on-error: true` and must not be marked required until it is
stable across multiple PRs.

### Local run

```bash
supabase start
supabase db reset
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=...          # from `supabase status`
export SUPABASE_SERVICE_ROLE_KEY=...  # local only; NEVER production
# optional: export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

bun run test:pi-ingest-db-security
bun run test:storage-db-security
bun run test:profiles-db-security
bun run test:security-db-local
```

### Opt-in CI

The `Security DB Local` GitHub workflow only runs the harnesses when
explicitly enabled. Either:

- Trigger via **Actions → Security DB Local → Run workflow** with the
  `run_db_security` input set to `true`, or
- Set the repository variable `ENABLE_DB_SECURITY_LANE` to `'true'`.

Without one of those, the job checks out nothing, boots nothing, and
writes a skip notice to the run summary. It is never a required check.

### Blocked behavior

If any of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
is missing, the runners exit with code `2` and a clear `BLOCKED:` message.
They never fake a pass. Required CI never depends on these variables.

### What the harnesses cover

- `test:pi-ingest-db-security` — proves `pi_ingest_commit_batch` rejects
  cross-tent and cross-user replays and creates no `sensor_readings` or
  `action_queue` rows on rejection.
- `test:storage-db-security` — proves diary photo/video buckets are
  owner-scoped and public buckets are read-only for anon.
- `test:profiles-db-security` — proves authenticated clients cannot
  update `profiles.tier`, `profiles.level`, or `profiles.nugs_total`,
  that mixed blocked+allowed updates are atomic (no partial mutation),
  that legitimate profile edits (`display_name`, `current_badge`) still
  succeed, and that cross-user profile writes remain blocked by RLS.
  Runtime companion to the static
  `src/test/profiles-gamification-write-protection.test.ts` and
  `src/test/profiles-tier-entitlement-query-boundary.test.ts`.

Current status: **scaffolded / expanding**. Vitest specs live under
`src/test/pi-ingest-commit-batch-replay.integration.test.ts`,
`src/test/storage-policy-security.integration.test.ts`, and
`src/test/integration/profiles-gamification-write-protection.integration.test.ts`
and grow as local fixtures stabilise. Static contract coverage in Tier 1
already guards the policy shapes.

> **Never** paste `SUPABASE_SERVICE_ROLE_KEY`, auth JWTs, or refresh
> tokens into chat, screenshots, logs, or issue comments. This harness
> uses the service role only for test setup/teardown and never logs it.

## Security hygiene

- **Never** paste `SUPABASE_SERVICE_ROLE_KEY`, bridge tokens, or Paddle
  webhook secrets into chat, screenshots, logs, or issue comments.
- Test-only fake secrets (e.g. in `paddleSignatureTestHelper` or the
  Deno security test) must be obviously fake and must not match real
  prefixes (`pdl_ntfset_`, `sk_live_`, `sk_test_`).
- Client bundles must never import the service role key — enforced by
  `scripts/security/static-client-secret-scan.mjs`.
- The optional DB job uses only **local** Supabase keys. No production
  service role, no production webhook secret, no real bridge token.

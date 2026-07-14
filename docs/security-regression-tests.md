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
bun run test:customer-mode-db-security
bun run test:security-db-local     # aggregate — runs all of the above
```

Each individual runner exits with code `2` and a `BLOCKED:` message when
required env vars are missing so it never fakes a pass.

### Local grant parity (`supabase/seed.sql`)

`supabase db reset` applies `supabase/seed.sql` after migrations. It exists
because the hosted project (created 2026-05) is grandfathered on Supabase's
**legacy default privileges** — anon/authenticated/service_role receive DML
grants on new public tables automatically, and RLS is the real guard — while
fresh local stacks from the current CLI ship the **hardened default ACL**
(no client DML on new tables). Without the seed, a plain `db reset` leaves
~36 app tables (plants, tents, diary_entries, profiles, …) unreadable by
clients, which does not match production and makes the runtime harnesses
fail during setup with `42501 permission denied` instead of exercising RLS
and triggers.

The seed restores the production GRANT baseline and then re-applies the
migrations' deliberate hardening REVOKEs (existence-guarded), so those stay
authoritative. It runs **only** on local/preview `db reset` — it is never
applied to the hosted project. If a table is deliberately locked down at the
GRANT layer in a migration, add it to the deny-list in the seed as well.

Verified end-to-end 2026-07-09: with the seed in place, both profiles
harness suites pass 14/14 against a fresh `supabase start` + `db reset`
(write-protection 10/10 including trigger and RPC paths; entitlement
resolution 4/4 with zero `public.profiles` queries).

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

- `test:pi-ingest-db-security` — proves `pi_ingest_commit_batch` is
  executable by service_role only (anon/authenticated get 42501); that
  full and partial batch replays are rejected per `(user_id,
  idempotency_key)` without duplicate `sensor_readings`; that a
  cross-user tent hard-fails and persists nothing; that one invalid row
  aborts the whole batch atomically; that commits never write `alerts`
  or `action_queue` rows; that the idempotency ledger is owner-scoped
  (own rows visible, other users' rows invisible) and
  `pi_ingest_bridge_credentials` is unreadable through the API; and that
  every rejection error is sanitized (no service_role / JWT / auth-header
  / stack-frame leakage).
- `test:storage-db-security` — proves the `diary-photos` bucket is
  private and folder-scoped: users can upload / read / delete only under
  their own `<user_id>/…` prefix; cross-user upload is denied (verified
  by service-side object absence); cross-user download is denied;
  cross-user listing exposes nothing; anonymous download is denied; and
  cross-user delete is a no-op (verified by the object's survival, since
  the storage API can return success-with-empty for RLS-filtered
  removes). Denial errors are checked against the same leak deny-list.
- `test:profiles-db-security` — proves authenticated clients cannot
  update `profiles.tier`, `profiles.level`, or `profiles.nugs_total`;
  cannot DELETE their own or any other user's profile; cannot bypass the
  gamification trigger via an RPC path; that destructive combinations
  (null / zero / negative) are rejected; that mixed blocked+allowed
  updates are atomic; that legitimate profile edits (`display_name`,
  `current_badge`) still succeed; and that all rejected errors are
  sanitized (no provider / customer / subscription / service_role /
  JWT / stack-frame leakage). Also runs
  `profiles-entitlement-resolution-boundary.integration.test.ts`, which
  wraps the authenticated Supabase client in a query-recording Proxy,
  drives the real Verdant entitlement path (billing_subscriptions +
  subscriptions + user_roles → `resolveUnionEntitlements`) for free /
  pro_monthly / founder_lifetime / canceled seeds, and asserts the
  resolver never reads `public.profiles`. Runtime companion to the
  static `src/test/profiles-gamification-write-protection.test.ts` and
  `src/test/profiles-tier-entitlement-query-boundary.test.ts`.
- `test:customer-mode-db-security` — audits the repo for any Customer
  Mode data surface (tables, RPCs, edge functions, share-token routes)
  and, when local Supabase is up, proves an anonymous client cannot read
  operator rows from `grows`, `tents`, `plants`, `diary_entries`,
  `sensor_readings`, `alerts`, `action_queue`, `pheno_hunts`,
  `pheno_keepers`, `billing_subscriptions`, or `subscriptions`, cannot
  INSERT into any operator write table, and cannot resolve operator
  entitlement via `has_pheno_tracker_entitlement`. The audit fails
  loudly if Customer Mode grows a backend without paired isolation
  coverage.

### Sanitized DB error shape

`src/test/integration/_helpers/sanitizedDbError.ts` centralises the
`expectSanitizedDbError` matcher used across every DB harness. Postgres
error text (message / details / hint / code / status) must contain none
of: billing/entitlement table names (`billing_subscriptions`,
`paddle_events`, `payment_customers`, `billing_subscription_update_audit`,
`entitlement(s)`); provider IDs / column names (`paddle`, `stripe`,
`provider_customer_id`, `provider_subscription_id`, `cus_*`, `sub_*`,
`pdl_*`, `pri_*`); tier / plan / period leakage (`profiles.tier`,
`select tier from profiles`, `displayPlanId`, `effectivePlanId`,
`plan_id`, `current_period_end`); auth/secret material (`service_role`,
`SUPABASE_SERVICE_ROLE_KEY`, `Authorization: …`, `Bearer …`, JWT-shaped
strings, `refresh_token`, `access_token`); stack frames, absolute
`/home|/Users|/var|/root|/opt|/workspace` paths with `:line:column`, or
leaked `CREATE FUNCTION` / `RETURNS … AS $$` bodies. Fixture coverage
lives in `src/test/sanitized-db-error-helper.test.ts` (fast lane).

### Workflow summary

`.github/workflows/security-db-local.yml` always writes a
`$GITHUB_STEP_SUMMARY` reporting lane status (disabled / passed /
failed / cancelled), tests requested, artifact name
(`security-db-local-artifacts`, upload-on-failure only, 14-day
retention), which sanitized log paths are inside it, and a link to the
current run. The summary itself contains no secrets, JWTs, or DB URLs.


Current status: **implemented and verified end-to-end** (2026-07-09,
fresh `supabase start` + `db reset` + grant-parity seed): profiles
14/14, pi-ingest 9/9, storage 9/9. Vitest specs live under
`src/test/integration/pi-ingest-commit-batch-replay.integration.test.ts`,
`src/test/integration/storage-policy-security.integration.test.ts`,
`src/test/integration/profiles-gamification-write-protection.integration.test.ts`,
and `src/test/integration/profiles-entitlement-resolution-boundary.integration.test.ts`.
Static contract coverage in Tier 1 continues to guard the policy shapes
on every PR.

All four DB-backed specs skip unless the Supabase URL is a local
loopback host (127.0.0.1 / localhost / ::1), so a stray staging or
production `SUPABASE_URL` in the environment can never make the
mutating setup run against a remote project — even if the specs are
discovered by the repo-wide `vitest run` rather than the harness runner.

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

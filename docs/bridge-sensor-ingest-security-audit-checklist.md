# Bridge Sensor-Ingest Security Audit Checklist (`vbt_` trust chain)

Canonical audit standard for Verdant's generic bridge sensor trust chain:

```text
mint -> hash at rest -> present bearer -> verify -> entitle -> tent scope
     -> freshness gate -> persist -> audit trail -> revoke
```

Use this checklist for every PR that touches `mint-bridge-token`,
`revoke-bridge-token`, `sensor-ingest-webhook`, `ecowitt-ingest`,
`supabase/functions/_shared/sensorIngestAuth.ts`,
`supabase/functions/_shared/liveSensorEntitlementGate.ts`,
`supabase/functions/_shared/sensorIngestFreshness.ts`, the `bridge_tokens`
migrations, or any client surface that mints, reveals, lists, or revokes
bridge tokens.

Every item is labeled with how it is proven:

- **[E##]** — pinned by the automated evidence lane
  `bun run test:bridge-sensor-ingest-evidence`
  (`scripts/security/bridge-sensor-ingest-evidence-checks.mjs`, self-tested by
  `scripts/security/test-bridge-sensor-ingest-evidence-checks.mjs`). The lane
  runs in the required `Security regression` workflow.
- **[runtime: <file>]** — pinned by an existing runtime/e2e/static test suite.
- **MANUAL** — must be reviewed by a human on every touching PR.
- **`NOT_MEASURED` / `missing evidence`** — no automated or runtime proof
  exists today; listed in [Known gaps](#known-gaps-and-open-decisions).

Evidence-labeled facts below were verified against the deploy branch
(`verdant-grow-diary`) at commit `ef11737989e0` on 2026-08-04. The live site
deploys from `verdant-grow-diary`, not `main`; re-verify against the deploy
branch, never `main`.

---

## 1. Token issuance (`mint-bridge-token`)

- [ ] [E17] Minting requires a verified Supabase session JWT
      (`auth.getClaims`); the user id comes only from verified claims, never
      from request JSON.
- [ ] [E18] Minting enforces the server-authoritative live-sensor entitlement
      gate (`requireLiveSensorEntitlement`) before any insert. Billing plan or
      capabilities in the request body are never read.
- [ ] [E19] Minting verifies tent ownership (`tents.user_id` = caller) before
      issuing a tent-scoped token; the `bridge_tokens` INSERT policy enforces
      the same check as defense-in-depth.
- [ ] [E21] Token entropy is 32 CSPRNG bytes (`crypto.getRandomValues`),
      base64url-encoded behind the `vbt_` prefix.
- [ ] [E23] TTL is clamped server-side (1 hour – 365 days); the DB
      `bridge_tokens_validate_insert` trigger enforces the same bounds at the
      row level.
- [ ] [runtime: `supabase/functions/mint-bridge-token/handler_e2e_test.ts`]
      Free/degraded/unverifiable entitlements are denied before any insert
      (403 `upgrade_required` / 503 `entitlement_lookup_failed`, zero rows).
- [ ] MANUAL — any new mint parameter must be validated, clamped, and
      impossible to use for cross-user or cross-tent issuance.

## 2. Storage at rest (`bridge_tokens` schema + RLS)

- [ ] [E20] Only the SHA-256 hash (`token_hash`) and a short non-secret
      prefix (`token_prefix`, `vbt_` + 8 chars) are persisted. The insert
      payload never carries the plaintext.
- [ ] [E31] No migration ever adds a plaintext token column.
- [ ] [E29] RLS is enabled on `bridge_tokens` and never disabled by a later
      migration.
- [ ] [E30] No `bridge_tokens` policy or grant addresses `anon`.
- [ ] [E34] `bump_bridge_token_usage` (SECURITY DEFINER) is executable by
      `service_role` only — `EXECUTE` is revoked from `PUBLIC`, `anon`, and
      `authenticated`, so clients cannot forge usage bumps.
- [ ] MANUAL — deliberate deviation to re-confirm on every schema PR: unlike
      the repo's preferred "service_role writes only" pattern,
      `bridge_tokens` has owner-scoped client SELECT/INSERT/UPDATE policies
      (+ a DELETE policy added 2026-06-22), all anchored on
      `auth.uid() = user_id`, with a `BEFORE UPDATE` trigger freezing
      `user_id`, `tent_id`, `token_hash`, `token_prefix`, `expires_at`,
      `created_at`. Any new policy or trigger change must keep every policy
      owner-scoped and must not widen the mutable column set. Note the
      `SELECT` grant is table-wide and RLS is row-level, so owners can read
      every column of their own rows, including `token_hash` (gap G10).

## 3. Presentation and verification (webhook auth)

- [ ] [E1] `vbt_` is the canonical bridge marker
      (`BRIDGE_PREFIX` in `_shared/sensorIngestAuth.ts`).
- [ ] [E2] Presented tokens are SHA-256 hashed before lookup; the raw token
      is never used as a query key.
- [ ] [E3] Revoked tokens (`revoked_at` set) are rejected.
- [ ] [E4] Expired tokens are rejected against the injected request clock.
- [ ] [E5] Short/garbage `vbt_` bearers are rejected before any DB lookup
      (no lookup oracle for junk input).
- [ ] [E6] With `allowJwt === false` the resolver returns `bridge_required` —
      no silent JWT fallback.
- [ ] [E7] `sensor-ingest-webhook` calls the resolver with `allowJwt: false`:
      ordinary user JWTs may never promote caller-asserted readings into
      trusted live telemetry.
- [ ] [E8] Defense-in-depth kind narrowing (`auth.kind !== "bridge"` → 403)
      protects against a future auth-helper change restoring a JWT path.
- [ ] [E9] The webhook's JWT claims lookup is stubbed to `{ sub: null }` — it
      cannot resolve a user JWT even if reached.
- [ ] [E15] The webhook's local `auth.ts` is a pure re-export of the shared
      twin — deployed code and shared code cannot drift.
- [ ] [runtime: `supabase/functions/sensor-ingest-webhook/auth.test.ts`,
      `handler_e2e_test.ts` — CI: `sensor-ingest-webhook-edge-tests.yml`]
      Rejection paths (revoked, expired, short-token-no-lookup, missing
      service key, lookup error, empty bearer, JWT-refused) are pinned at
      runtime.

## 4. Entitlement gating (every use, not just mint)

- [ ] [E10] The webhook re-checks `requireLiveSensorEntitlement` on every
      request: a downgrade, expiry, or lookup failure closes live ingest
      immediately. The bridge token is authentication, never billing
      authority.
- [ ] [runtime: `src/test/live-sensor-edge-entitlement-static-safety.test.ts`]
      The gate call appears before the protected write in
      `mint-bridge-token`, `sensor-ingest-webhook`, and `ecowitt-ingest`
      sources (static ordering pin).
- [ ] [runtime: `src/test/live-sensor-edge-entitlement-gate.test.ts`]
      Free fails closed; legacy `billing_subscriptions` is never consulted;
      degraded/unverifiable paid rows fail closed.
- [ ] MANUAL — quota/entitlement denials must stay calm 403/503 responses,
      never crashes, and must not leak entitlement internals.

## 5. Tent scoping

- [ ] [E11] The webhook enforces `tentScopeMatches` against the payload tent
      and returns `forbidden_tent` on mismatch, before persistence.
- [ ] [E19] Mint binds each token to one owned tent at issuance.
- [ ] [runtime: `handler_e2e_test.ts` (webhook + ecowitt-ingest)] Cross-tent
      payloads produce zero writes at the handler level.

## 6. Ownership stamping

- [ ] [E12] `user_id` is stamped from the authenticated bridge row
      (`auth.userId`); caller-supplied `user_id` is never read from the body.
- [ ] [runtime: `src/test/sensor-ingest-webhook-matrix.test.ts`]
      Caller-supplied `user_id` is ignored and stripped from `raw_payload`;
      the handler authenticates before parsing the body.

## 7. Freshness and sensor-truth gating

- [ ] [E13] Stale timestamps fail closed at the request level before
      persistence (non-retryable 2xx, `timestamp_stale`), against the server
      clock.
- [ ] [E25] The server ingest window is pinned at **30 minutes**
      (`LIVE_INGEST_FRESHNESS_WINDOW_MS`). Changing this value must update
      this checklist and the evidence lane in the same PR — the value is
      deliberately load-bearing: the webhook's stale rejection is tied to the
      `sensor_readings` dedupe uniqueness key (`user_id, tent_id, source,
  metric, captured_at`), so a window change is never a one-line edit.
- [ ] [runtime: `storageMapping` tests via the webhook vitest suites]
      Per-row provenance is demoted `live -> stale` at the same 30m boundary,
      so replayed packets cannot land as live.
- [ ] MANUAL — transport provenance alone never makes an old reading
      current; any new ingest surface must classify freshness with the shared
      module, not a local constant.

## 8. Persistence integrity

- [ ] [runtime: `src/test/sensor-ingest-webhook-idempotency-race.test.ts`]
      Writes are atomic upserts with
      `onConflict (user_id, tent_id, source, metric, captured_at)` +
      `ignoreDuplicates`; concurrent identical POSTs cannot double-insert.
- [ ] MANUAL — only the server-side service client persists trusted live
      telemetry; no client write path may gain the ability to insert
      `source='live'` rows (see `sensor_readings` source RLS harness).

## 9. Revocation and lifecycle

- [ ] [E24] `revoke-bridge-token` scopes its update by
      `.eq("user_id", userId)` under the caller's JWT (RLS enforced), sets
      `revoked_at`, and uses no service-role credentials.
- [ ] [E3] Revoked tokens are rejected at verification time.
- [ ] `NOT_MEASURED` — `revoke-bridge-token` has **zero** direct automated
      coverage (no test pins owner-only revocation, idempotency, or error
      redaction). See Known gaps.
- [ ] MANUAL — soft-revocation state is currently client-reversible (see
      Known gaps G1); until hardened, treat `revoked_at` as owner-honest, not
      adversary-proof.

## 10. Error-response and log redaction

- [ ] [E14] Every webhook response body flows through `sanitizeForResponse`.
- [ ] [E16] The sanitizer treats `vbt_`-shaped strings, JWT-shaped strings,
      `Bearer` fragments, and service-role-shaped keys as secrets.
- [ ] [runtime: `src/test/sensor-ingest-webhook-error-leakage.test.ts`,
      `sensor-ingest-webhook-secret-leakage.test.ts`, `cors_e2e_test.ts`]
      No PG error text, token, hash, or bridge id is echoed in any response
      or log line.

## 11. Client reveal / redaction boundaries

- [ ] [runtime: `src/test/tent-bridge-tokens-card-load-failure.test.ts`,
      `tent-bridge-tokens-page-safety.test.tsx`] The token list queries
      metadata columns only (never `token_hash`), renders `token_prefix` +
      ellipsis, and load failures render calm copy, not raw DB errors.
- [ ] [runtime: `src/test/aud-004-webhook-curl-no-live-token.test.tsx`] The
      webhook settings card renders only the `<VBT_BRIDGE_TOKEN>` placeholder
      and never reads the browser session JWT.
- [ ] [E26] The client/published secret scanner keeps forbidding
      bridge-token identifiers in `src/`, `public/`, and `dist/`.
- [ ] MANUAL — the plaintext exists client-side only in component memory
      during the one-time reveal (`TentBridgeTokensCard`,
      `SensorsTestbenchPanel`); any change must keep it out of storage
      (`localStorage`/`sessionStorage`/IndexedDB), out of `console.*`, out of
      analytics/error reporters, and out of persisted exports
      (`sensorDiagnosticsExportRules` redaction).
- [ ] MANUAL — copy-to-clipboard of the plaintext is a deliberate,
      warned-in-copy exposure; do not add new copy paths without a blocking
      confirmation (see Known gaps G6 for the two unconfirmed legacy paths).

## 12. Sibling isolation

The generic `vbt_` chain has three siblings with deliberately different auth
models. Isolation must hold in both directions.

- [ ] [E32] `ecowitt-ingest` is the **second sanctioned `vbt_` consumer**:
      same shared resolver, `allowJwt: false`, same entitlement gate, tent
      scope filtering, canonical `live` source with vendor lineage in
      `raw_payload`. (Cross-acceptance between the webhook and
      `ecowitt-ingest` is by design; see Known gaps G7 on audience scoping.)
- [ ] [E33] `pi-ingest-readings` stays HMAC-only (`x-bridge-id` /
      `x-bridge-signature` / `x-bridge-timestamp`, ±5 min window,
      constant-time compare, tent-scoped credentials, source `pi_bridge`).
      It never reads a bearer `Authorization` header and never accepts
      `vbt_`.
- [ ] [E6]+[E7] The webhook rejects sibling credentials structurally: any
      non-`vbt_` bearer (EcoWitt static secret, PASSKEY, JWT) yields
      `bridge_required`; Pi HMAC headers are never read.
- [ ] Established fact (audit 2026-08-04): the EcoWitt PASSKEY is never an
      auth factor — it is reduced to a one-way truncated SHA-256 fingerprint
      (`ewfp_`) for routing only.
- [ ] MANUAL — `ecowitt-real-ingest` is validation-only (no persistence), is
      authenticated by a single static env secret compared in constant time,
      and has **no entitlement gate**; its no-persistence contract is
      enforced by convention, not structure. Do not add persistence there
      without routing through the full trust chain.

## 13. Observability and audit trail

- [ ] Established fact: every accepted ingest appends a
      `sensor_ingest_audit_log` row (service-role write, no caller-supplied
      fields; best-effort, never fails the ingest) and bumps per-token usage
      via the locked-down `bump_bridge_token_usage` RPC.
- [ ] MANUAL — per-token counters (`ingest_count`, `first_used_at`,
      `last_used_at`) are client-mutable today (Known gaps G1) and must not
      be presented as tamper-proof audit evidence; `sensor_ingest_audit_log`
      is the trustworthy record.

## 14. Validation commands

```bash
bun run test:bridge-sensor-ingest-evidence
bun run test:edge:sensor-ingest-webhook
bunx vitest run src/test/sensor-ingest-webhook-matrix.test.ts src/test/sensor-ingest-webhook-error-leakage.test.ts src/test/sensor-ingest-webhook-secret-leakage.test.ts src/test/sensor-ingest-webhook-idempotency-race.test.ts src/test/live-sensor-edge-entitlement-gate.test.ts src/test/live-sensor-edge-entitlement-static-safety.test.ts src/test/tent-bridge-tokens-page-safety.test.tsx src/test/tent-bridge-tokens-card-load-failure.test.ts
```

The evidence lane also runs in CI inside the `Security regression` workflow
([E27]/[E28] pin the wiring itself, so the lane cannot be silently removed).

---

## Known gaps and open decisions

Recorded 2026-08-04 from a five-surface audit at `ef11737989e0`. These are
**not** silently accepted; each needs either a hardening slice or an explicit
accepted-risk entry in `docs/security-exceptions.md`.

- **G1 — soft-revocation is client-reversible** (established fact).
  `revoked_at`, `name`, `last_used_at`, `first_used_at`, `ingest_count` are
  absent from the `bridge_tokens_guard_immutables` trigger, so an owner (or
  any code running with the owner's session, e.g. XSS) can UPDATE
  `revoked_at` back to `NULL` and re-activate a revoked token, and can
  rewrite usage counters. Owner-scoped only — not privilege escalation — but
  revocation is not authoritative against the client. Hardening candidate:
  guard `revoked_at` (one-way set) and the usage columns in the trigger.
- **G2 — direct client INSERT bypasses mint's guarantees** (established
  fact). The INSERT policy lets an authenticated owner insert a
  `bridge_tokens` row with a self-chosen `token_hash`, skipping mint's
  entropy, entitlement check, and `vbt_` format (DB trigger enforces only
  TTL bounds, prefix ≥ 6, hash ≥ 32). Blast radius is bounded — ingest
  re-checks entitlement per request and the row is owner/tent-scoped — but
  weak self-chosen tokens become possible. Decision needed: tighten to
  service-role-only INSERT (preferred pattern) or accept with an exceptions
  entry.
- **G3 — no runtime RLS harness for `bridge_tokens`** (`missing evidence`).
  Unlike `sensor_readings`, storage, profiles, etc., no harness proves at
  runtime that cross-user SELECT/UPDATE/DELETE is denied, or that the DELETE
  policy actually functions (no `GRANT DELETE` exists in migrations; it
  depends on platform default privileges — unverifiable from the repo).
  Note the harness cannot and should not try to prove `token_hash`
  non-recoverability — see G10, that visibility is real under current
  grants.
- **G10 — owners can read their own `token_hash`** (established fact).
  The founding migration grants table-wide `SELECT` to `authenticated` and
  RLS filters rows, not columns, so an owner (or any code holding the
  owner's session) can select their own rows' `token_hash` directly; the
  migration's "hash is opaque" comment is design intent, not an enforced
  control. Risk is bounded by SHA-256 preimage resistance — the plaintext
  is never stored — and the exposure is same-owner-only. The one-time-reveal
  guarantee (§11) applies to the plaintext, not the hash. Hardening
  candidates: column-level privileges or a metadata-only view for client
  reads.
- **G4 — mint/revoke test coverage holes** (`missing evidence`).
  `mint-bridge-token/handler_e2e_test.ts` is wired to **no** CI workflow or
  package script (the Deno edge-tests workflow's run list and path filters
  omit `mint-bridge-token/**`), and `revoke-bridge-token` has zero tests
  anywhere. Hash-only storage at mint is not positively asserted by any test
  (only the JWT-absence is).
- **G5 — freshness dual-authority (open product decision, owner: Cheek)**.
  Server ingest accepts and stores `live` up to 30m; open PR #691 moves
  client current-state display to live 15m / manual 24h without touching
  `sensorIngestFreshness`. If #691 merges as-is, readings aged 15–30m are
  stored as `live` but displayed stale — plus a long tail of surfaces on
  other windows (60m normalization, 6h AI sufficiency, 48h readiness, 5m
  `ecowitt-real-ingest`, 15m/60m metric badges). The webhook comment ties
  the 30m window to the dedupe uniqueness key, so server-side alignment is a
  deliberate slice, not a constant edit. This checklist pins the server value
  ([E25]) so any change is forced through review.
- **G6 — client reveal-surface gaps** (established facts).
  `SensorsTestbenchPanel`'s reveal has no Dismiss control (its own header
  comment claims one); during reveal the plaintext renders in two DOM
  locations (reveal box + always-rendered PowerShell listener snippet);
  `copyCurl`/`copyPowerShell` embed the real token with no blocking
  confirmation (only `copyPowerShellIngest` confirms); raw response bodies
  render on-screen without `redactTokens` (exports are redacted, display is
  not); the DOM leak-scan test's forbidden-terms list lacks a `/vbt_/`
  pattern; mint/revoke failure toasts render server-controlled text
  verbatim; nothing clears the clipboard after a copy.
- **G7 — no audience scoping between `vbt_` consumers** (practical
  observation). One token works on both `sensor-ingest-webhook` and
  `ecowitt-ingest`. Bounded by tent scope + per-request entitlement; record
  as accepted design or add a purpose claim in a future slice.
- **G8 — no cap on active tokens per user/tent; no mint rate limit**
  (`NOT_MEASURED`). Nothing limits unexpired-token accumulation.
- **G9 — token lifecycle vs tent deletion** (`missing evidence`). No FK or
  cleanup invalidates tokens for a deleted tent at the DB layer; runtime
  behavior depends on tent-scope checks alone.

## Review cadence

Re-run the five-surface audit (RLS/migrations, client reveal, sibling
isolation, test inventory, freshness map) whenever a PR touches the trust
chain, and at minimum once per quarter. Update the commit anchor at the top
when re-verified.

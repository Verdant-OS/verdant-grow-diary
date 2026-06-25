# Security Exceptions Registry

This document tracks intentionally accepted Supabase linter warnings and other
security findings so they do not become tribal knowledge. Every entry must
identify the finding, justify the exception, list the safety controls that
contain its blast radius, and reference the regression tests that prove those
controls remain in place.

**Note:** New SECURITY DEFINER functions require explicit review and dedicated tests before being added. This registry does **not** authorize adding more SECURITY DEFINER helpers as a general pattern — each one must be justified, scoped, and tested individually.

---

## Exception 1 — `public.has_role(uuid, app_role)`

- **Supabase linter code:** 0029 (Security Definer Function)
- **Function:** `public.has_role(uuid, public.app_role)`
- **Decision:** accepted
- **Reason:** Required for non-recursive RLS role checks on the
  `public.user_roles` table. If this helper ran as `SECURITY INVOKER`, RLS on
  `user_roles` would recursively invoke the same policy that calls `has_role`,
  causing role checks to fail or short-circuit to `NULL`. This is the pattern
  recommended by Supabase for role-based RLS.

### Safety controls

The following controls are enforced by migration and verified by tests:

- `LANGUAGE sql`
- `STABLE` (read-only, no side effects)
- `search_path` pinned to `public`
- Returns `boolean` only (no row leakage)
- Body filters by the `_user_id` parameter (no `auth.uid()` override inside the
  body)
- No dynamic SQL
- No `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` / `ALTER` in the body
- `EXECUTE` is **not** granted to `anon` or `public`
- Rationale documented via `COMMENT ON FUNCTION public.has_role`

### Tests

- `src/test/has-role-security-definer.test.ts`

---

## Exception 2 — `public.pi_ingest_bridge_credentials` has no `SELECT` policy

- **Scanner finding:** "Table has RLS enabled but no SELECT policy"
- **Table:** `public.pi_ingest_bridge_credentials`
- **Decision:** intentionally accepted — **do not add a client `SELECT` policy**
- **Reason:** This table stores encrypted bridge credential material
  (`secret_hash`, `secret_ciphertext`, `secret_nonce`, `secret_key_version`).
  It is server-only by design. The sole authorized reader is the
  `pi-ingest-readings` Edge Function using trusted server-side `service_role`
  access. Authenticated clients must never read these rows; adding a `SELECT`
  policy would expand the attack surface for no product benefit.

### Safety controls

- RLS enabled on the table.
- No `SELECT` policy exists for `anon` or `authenticated`.
- Client-facing reads go through the safe, non-secret metadata view, not the
  raw credentials table.
- Edge-function reads happen via `service_role` in a trusted server context.
- No frontend code imports or queries `pi_ingest_bridge_credentials`.

### Tests

- `src/test/piIngestBridgeCredentialStorage.test.ts`
- `src/test/piIngestBridgeCredentialEncryptedStorage.test.ts`
- `src/test/piIngestBridgeCredentialsSafeViewLintFix.test.ts`

---

## Exception 3 — `public.paddle_events` has no client-side policies

- **Scanner finding:** "Paddle webhook payloads have no SELECT policy — data
  access is fully blocked but INSERT/UPDATE are also missing"
  (`paddle_events_no_select_policy`)
- **Decision:** intentionally accepted — **do not add client policies**
- **Reason:** `paddle_events` stores raw Paddle billing webhook bodies
  including customer PII and subscription details. The table is written
  exclusively by the `paddle-webhook` Edge Function using `service_role` and is
  never read or written by the client. No `SELECT` / `INSERT` / `UPDATE` /
  `DELETE` policies exist for `anon` or `authenticated`, which correctly fails
  closed at the Data API. The finding text itself notes "No action needed if
  server-only access is confirmed and intentional" — that is the case here.

### Safety controls

- RLS enabled on the table; zero client-facing policies.
- All writes flow through the `paddle-webhook` Edge Function under
  `service_role` in a trusted server context.
- No client code imports, selects, or renders `paddle_events` or its `payload`
  column.
- Billing entitlement reads go through `public.billing_subscriptions`, not
  `paddle_events`.

### Tests / guards

- Static-safety guard: no `from("paddle_events")` reference exists outside
  `supabase/functions/paddle-webhook/`.

---

## Exception 4 — `public.sensor_readings.raw_payload` is owner-scoped

- **Scanner finding:** "sensor_readings.raw_payload is readable by the row
  owner and may contain unredacted device data"
  (`sensor_readings_raw_payload_exposure`)
- **Decision:** intentionally accepted — owner-only read with
  client-side redaction
- **Reason:** `raw_payload` is required for operator diagnostic surfaces
  (Ingest Inspector, EcoWitt Ingest Audit) that must show the original
  payload shape to debug sensor truth issues. Access is already tightly
  constrained:
  - RLS restricts every `SELECT` on `sensor_readings` to
    `auth.uid() = user_id` — a user can only see their own ingest rows.
  - All client surfaces that display `raw_payload` route through
    `redactRawPayload` / `redactEcoWittRawPayload` first; the raw bytes
    are never rendered.
  - The general action-queue / evidence / AI-doctor view-models have
    regression tests asserting that `raw_payload`, `service_role`,
    `bridge_token`, and similar markers never leak into normal UI.

  Migrating to a redacted view would either break the operator
  diagnostic pages or require a parallel server-side redaction
  pipeline. The current owner-scoped + client-redacted design is
  deliberate.

### Safety controls

- RLS `SELECT` policy is strictly `auth.uid() = user_id`. No anon read.
- Diagnostic pages call `redactRawPayload` / `redactEcoWittRawPayload`
  before any display.
- Static-safety tests assert `raw_payload` does not appear in non-operator
  view-models (see `src/test/action-queue-evidence-provenance-leakage.test.ts`,
  `src/test/action-queue-evidence-view-model.test.ts`,
  `src/test/action-detail-missing-evidence-review-link.test.ts`).
- AI Doctor / Action Queue evidence pipelines do not select `raw_payload`.

### Future hardening (not blocking)

If operator diagnostic flows are moved server-side, replace direct
`raw_payload` reads with a `SECURITY DEFINER` RPC that returns a
pre-redacted payload, then `REVOKE SELECT (raw_payload) ON
public.sensor_readings FROM authenticated`. That work is out of scope
for this exception.

---

## Resolved finding — Verdant storage bucket owner-scoped `UPDATE` / `DELETE`

- **Scanner finding:** "Storage bucket `verdant` missing UPDATE/DELETE
  policies" (warn-level)
- **Status:** **fixed** (not an exception) — recorded here for traceability.
- **Resolution:** Migration
  `supabase/migrations/20260619003613_4dda0b4a-c323-4351-8b8d-99eb704b2f51.sql`
  adds least-privilege owner-path-scoped policies:
  - `Users update own verdant objects`
  - `Users delete own verdant objects`

  Both are `TO authenticated`, scoped to `bucket_id = 'verdant'`, and require
  `(storage.foldername(name))[1] = auth.uid()::text`. The bucket remains
  private. No `USING (true)`, no public grant, no `service_role`, no
  `SECURITY DEFINER`.

### Note on `verdant-master-prompt.md`

This object is admin-uploaded and does **not** live under a `{user_id}/...`
path, so it is naturally excluded from the owner-scoped `UPDATE` / `DELETE`
policies above. That exclusion is intentional — regular users cannot mutate
or delete it via these policies.

### Rollback

If these policies must be reverted, run:

```sql
DROP POLICY IF EXISTS "Users update own verdant objects" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own verdant objects" ON storage.objects;
```

After rollback, owner-driven object updates and deletes in the `verdant`
bucket will no longer be permitted from the client; only the existing
`INSERT` and `SELECT` policies remain.

### Tests

- `src/test/verdant-bucket-owner-policies-migration.test.ts`

---

## Scanner status (informational)

- The Lovable security scanner panel currently shows **0 active findings**
  for the items above.
- The Supabase database linter may still report unrelated pre-existing
  warnings (e.g. extension placement, auth configuration hints). Those are
  tracked separately and are **not** covered by this section — do not
  interpret "0 active findings" as "all Supabase linter warnings cleared".

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

# Security Exceptions Registry

This document tracks intentionally accepted Supabase linter warnings and other
security findings so they do not become tribal knowledge. Every entry must
identify the finding, justify the exception, list the safety controls that
contain its blast radius, and reference the regression tests that prove those
controls remain in place.

> **Note:** New `SECURITY DEFINER` functions require explicit review and
> dedicated tests before being added. This registry does **not** authorize
> adding more `SECURITY DEFINER` helpers as a general pattern — each one must
> be justified, scoped, and tested individually.

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

# QA Checklist — RLS-first Data Access

Verdant relies on Postgres Row Level Security as the access boundary.
Client-side `user_id` filters are a UX/performance hint, **not** access
control. Use this checklist for any new or changed data-access path.

## Per-surface checks

### Diary entries (`diary_entries`)
- [ ] Query relies on `auth.uid()`-bound RLS, not client-supplied `user_id`.
- [ ] Unauthenticated session returns 0 rows / fails closed (verified
      manually or via `supabase/functions/rls-selftest`).
- [ ] Cross-user request as user B for user A's entries returns 0 rows.
- [ ] No `service_role` import anywhere in the call path.

### Plant queries (`plants`, `plant_*` views)
- [ ] RLS scopes plants to the owning user.
- [ ] Joined reads (tent → plant → entries) all stay RLS-scoped.
- [ ] Mutations (`insert`/`update`/`delete`) covered by ownership policy
      or restricted to RPC.
- [ ] Cross-user denial verified.

### Customer-guide queries
- [ ] Public/anon-readable rows are intentional and reviewed.
- [ ] Private guidance scoped to authenticated users via policy.
- [ ] No client check substitutes for a missing policy.

## Cross-cutting checks

- [ ] Confirm every new query relies on RLS rather than client filters
      for authorization.
- [ ] `user_id` filters in client code are documented as UX/performance
      hints only — not security.
- [ ] Verify unauthenticated access behavior: signed-out call returns
      no rows / fails closed, never returns another user's data.
- [ ] Verify cross-user denial: signed in as user B, attempts to read
      or mutate user A's rows are rejected.
- [ ] Static scan: no `service_role`, `SERVICE_ROLE`, or
      `SUPABASE_SERVICE_ROLE_KEY` in `src/`.
- [ ] Static scan: no `@supabase/ssr`, `next/headers`, or
      `NEXT_PUBLIC_*` env vars in `src/`.
- [ ] Edge functions that use `service_role` are server-only and never
      imported from `src/`.

## Sign-off

- [ ] RLS verified
- [ ] Cross-user denial verified
- [ ] Unauthenticated denial verified
- [ ] No client-side privilege escalation surface introduced

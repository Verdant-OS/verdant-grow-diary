# Verdant Security Checklist

Production deployment: https://verdantgrowdiary.com — only the `/welcome`
landing route is public; all other routes require authentication.


Use this checklist for every Verdant PR that touches data access, auth, AI,
Action Queue, sensors, device control, or migrations. It complements
[`docs/security-exceptions.md`](./security-exceptions.md), which tracks the
small set of intentionally accepted security warnings.

If a PR cannot satisfy an item, document why in the PR description and link to
an entry in `docs/security-exceptions.md`.

---

## 1. Supabase / RLS requirements

- [ ] Every new table has Row Level Security **enabled**.
- [ ] Every table has explicit RLS policies for `SELECT`, `INSERT`, `UPDATE`,
      and `DELETE` as appropriate. Do not rely on the absence of a policy.
- [ ] No policy uses `USING (true)` or `WITH CHECK (true)` for authenticated
      user data.
- [ ] Policies are written against `auth.uid()` (server-evaluated) and never
      against a client-supplied identifier.
- [ ] Run `bunx supabase db lint` / the Supabase linter and resolve or
      document every finding in `docs/security-exceptions.md`.

## 2. `user_id` / `auth.uid()` ownership rules

- [ ] Every user-owned row has a `user_id uuid` column referencing the
      authenticated user.
- [ ] `user_id` defaults to `auth.uid()` or is set server-side by an RLS
      `WITH CHECK (user_id = auth.uid())` policy.
- [ ] Cross-resource ownership (e.g. `grow_targets.grow_id → grows.id`) is
      enforced by joining back to a table whose ownership is anchored on
      `auth.uid()`.

## 3. No client-trusted `user_id`

- [ ] The frontend never sends `user_id` as a trusted field. Any
      client-provided `user_id` must be re-checked server-side via RLS or an
      Edge Function guard.
- [ ] No code path lets a user write rows on behalf of another user.

## 4. No `service_role` in frontend or Edge Functions (unless reviewed)

- [ ] `service_role` keys never appear in `src/`, `public/`, `.env*`, or any
      bundled asset.
- [ ] Edge Functions use the caller's JWT (`SUPABASE_ANON_KEY` + forwarded
      `Authorization` header) by default.
- [ ] Any new use of `service_role` requires an explicit entry in
      `docs/security-exceptions.md` with a justification and a regression test.

## 5. Edge Function auth requirements

- [ ] Edge Functions verify the caller's JWT unless they are intentionally
      public, in which case the public scope is documented.
- [ ] Edge Functions validate input shape and reject unexpected fields.
- [ ] Edge Functions never echo secrets or internal IDs that the caller is not
      authorized to see.

## 6. AI Coach safety requirements

- [ ] AI Coach must not be invoked from new surfaces without review.
- [ ] AI Coach prompts/outputs must not be used to make unattended changes to
      user data, devices, or the Action Queue.
- [ ] Output safety constraints from `src/test/ai-coach-output-safety.test.ts`
      and `src/test/ai-coach-security.test.ts` continue to pass.

## 7. Action Queue approval-required requirements

- [ ] Action Queue items remain user-approved before any side effect runs.
- [ ] No new code path auto-completes, auto-approves, or auto-cancels queue
      items.
- [ ] Safety regressions are caught by `src/test/action-queue-safety.test.ts`.

## 8. `action_queue_events` immutability requirements

- [ ] `action_queue_events` rows are append-only — no UPDATE or DELETE paths.
- [ ] Audit guarantees from `src/test/action-queue-audit.test.ts` still hold.

## 9. Sensor data truthfulness requirements

- [ ] The Dashboard and sensor surfaces only display real readings from
      authenticated sources.
- [ ] Stale, missing, or suspicious data is surfaced as such — never silently
      substituted.

## 10. No fake live / demo data

- [ ] No component fabricates "live" sensor values, fake timestamps, or
      synthetic device responses.
- [ ] Demo/mock data, if present, is clearly labeled and gated.

## 11. No external-control / device-command code without explicit safety review

- [ ] No new code issues device commands, actuator toggles, or external
      control writes.
- [ ] Integrations remain read-only adapters unless a dedicated safety review
      is recorded.

## 12. SECURITY DEFINER review requirements

- [ ] New `SECURITY DEFINER` functions are **not** added casually. Each one
      requires:
  - A documented reason it cannot be `SECURITY INVOKER`.
  - `search_path` pinned (typically to `public`).
  - `STABLE` or `IMMUTABLE` where possible, and no writes unless justified.
  - `EXECUTE` not granted to `anon` or `public` unless explicitly required.
  - A regression test analogous to
    `src/test/has-role-security-definer.test.ts`.
  - An entry in `docs/security-exceptions.md`.
- [ ] The existing `public.has_role(uuid, app_role)` exception is the only
      currently accepted `SECURITY DEFINER` helper.

## 13. Testing / validation commands

Run all of the following before requesting review:

```bash
bunx vitest run
bunx eslint <changed files>
npm run build
```

All 651+ existing tests must pass. New behavior must ship with new tests.

---

## References

- [`docs/security-exceptions.md`](./security-exceptions.md)
- [`src/test/ai-coach-security.test.ts`](../src/test/ai-coach-security.test.ts)
- [`src/test/ai-coach-output-safety.test.ts`](../src/test/ai-coach-output-safety.test.ts)
- [`src/test/action-queue-safety.test.ts`](../src/test/action-queue-safety.test.ts)
- [`src/test/action-queue-audit.test.ts`](../src/test/action-queue-audit.test.ts)
- [`src/test/has-role-security-definer.test.ts`](../src/test/has-role-security-definer.test.ts)

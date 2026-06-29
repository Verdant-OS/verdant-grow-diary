## Plan-mode findings (read-only audit)

**Exact role guard path**
- Route: `src/App.tsx:225` — `/operator/demo-preview` is inside the `<Route element={<RequireOperatorRole />}>` group (lines ~184–230), nested under the authenticated `AppShell` (which already calls `useRequireAuth`).
- Guard: `src/components/RequireOperatorRole.tsx` → `useHasRole("operator")`.
- Hook: `src/hooks/useHasRole.ts` calls server-side RPC `supabase.rpc("has_role", { _user_id, _role })`. Roles are NEVER inferred client-side.
- DB: `public.app_role` enum = `('operator','customer')` (migration `20260517010926…`). Roles stored in `public.user_roles`. `has_role` is a SECURITY DEFINER SQL function gated by `user_roles`.
- No JWT claim or profile-metadata role path exists. The only way to grant operator is an `INSERT INTO public.user_roles (user_id, role) VALUES (<uid>, 'operator')` via service_role (no client policy allows that insert — verified: `user_roles` has only SELECT-own + operator-managed policies).

**Why the embedded preview stayed gated**
The session is authenticated (AppShell didn't redirect to `/auth`), but `has_role(auth.uid(), 'operator')` returned `false`. The signed-in test account simply has no row in `public.user_roles` with `role = 'operator'`. The guard is working as designed; nothing in code is wrong. This is an **account-provisioning gap**, not a code defect.

**Existing test coverage (already strong)**
- `src/test/operator-role-gate.test.ts`
- `src/test/operator-route-auth-protection.test.ts`
- `src/test/operator-route-mobile-coverage.test.ts`
- `src/test/operator-demo-preview-page.test.tsx` (already asserts operator-only render)
- `src/test/operator-demo-preview-static-safety.test.ts`

No new guard tests are needed — Option B is already satisfied.

**Seed pattern in repo**
No client-callable operator-seed helper exists, and we should not add one (would weaken the boundary). Operator role assignment is a one-time owner action via the backend.

---

## Chosen approach

**Option A (runbook) + Option C (gate copy polish).** No schema/RLS/Edge changes. No seed script. No bypass.

### File-level changes

1. `docs/operator-demo-preview-access-runbook.md` (new) — owner-only runbook:
   - Confirm the test account is signed in to the same Lovable Cloud project as the embedded preview (project ref check via in-app account email, not raw IDs).
   - Confirm `app_role` enum + `user_roles` table is the source of truth.
   - Owner-only step: assign the `operator` role by inserting one row into `public.user_roles` from the backend admin surface (no service_role values pasted, no SQL with secrets, no raw UIDs shown in public copy — refer to the account by email).
   - Re-test path: sign out → sign in as the operator account → navigate to `/operator/demo-preview` → expect the read-only walkthrough.
   - Explicit DO-NOT list: no public route, no `?operator=1` bypass, no service_role in client, no JWT-claim shortcut, no demo-only auth path.

2. `src/components/RequireOperatorRole.tsx` (copy polish only) — replace the current denied copy with the three approved lines:
   - "Signed in, but this account does not have operator access."
   - "Use an operator-role account for this preview."
   - "No operator data was loaded."
   - Continue to leak nothing (no uid, no role rows, no RPC error text, no table names). Existing `data-testid="require-operator-denied"` preserved.

3. `src/test/operator-role-gate.test.ts` (extend) — add assertions that the denied state contains the three new copy strings and does NOT contain any of: a UUID-shaped string, the substrings `user_roles`, `has_role`, `service_role`, `jwt`, `token`, `auth.uid`.

### Not doing
- Option B: existing tests cover it.
- Option D: no safe existing seed pattern in repo; adding one risks weakening the boundary. Operator provisioning stays an owner-only backend action documented in the runbook.

### Validation
- `bunx vitest run src/test/operator-role-gate.test.ts src/test/operator-route-auth-protection.test.ts src/test/operator-demo-preview-page.test.tsx src/test/operator-demo-preview-static-safety.test.ts`
- `bunx tsgo --noEmit`
- `node scripts/sensor-safety-check.mjs`
- `node scripts/assert-docs-safety.mjs` (covers new runbook)

### Safety verdict
GO. No guard weakening, no public exposure, no bypass param, no schema/RLS/Edge/auth changes, no DB writes, no AI, no automation, no device control, no secret exposure.

### Browser re-test instructions (after operator role is granted to the test account)
1. Sign out of the embedded preview.
2. Sign in as the operator-role account.
3. Navigate to `/operator/demo-preview`.
4. Expect the read-only One-Tent Evidence Chain walkthrough (no mutation controls).

### Risk / rollback
Minimal. Copy polish + new doc + extended assertions. Rollback = revert the 3 files.

**Approve to proceed with implementation, or tell me to stop at audit-only.**
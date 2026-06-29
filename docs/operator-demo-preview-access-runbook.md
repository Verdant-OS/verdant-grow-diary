# Operator Demo Preview — Access Runbook

Owner-only runbook for granting and verifying operator access to
`/operator/demo-preview` (the read-only One-Tent Evidence Chain walkthrough).

This document does **not** contain credentials, service keys, raw user IDs,
or any bypass mechanism.

---

## What the route requires

- Authenticated session (enforced by the app shell).
- Server-side role check: `has_role(auth.uid(), 'operator')` returns `true`.
- Role storage: a row in `public.user_roles` where `role = 'operator'`.

No JWT claim, profile flag, environment variable, or query parameter can
substitute. The guard (`src/components/RequireOperatorRole.tsx`) defers to
the server every time.

## Why a preview session can read "Access restricted"

The session is authenticated, but the signed-in account has no operator
row in `public.user_roles`. The guard is working as designed. This is an
**account-provisioning gap**, not a code defect.

## Step 1 — Confirm environment alignment

1. In the embedded preview, confirm the signed-in account by its email
   shown in the app shell account menu.
2. Confirm this is the same Lovable Cloud project the operator role will
   be granted in. Use the email, not raw IDs.

## Step 2 — Confirm the role source of truth

- Enum: `public.app_role` includes `'operator'`.
- Table: `public.user_roles (user_id, role)`.
- Function: `public.has_role(_user_id, _role)` (security definer, reads
  only `public.user_roles`).

## Step 3 — Grant the operator role (owner-only)

Performed by the project owner from the backend admin surface. One row,
one account, by email lookup:

- Look up the auth user by email.
- Insert a single row into `public.user_roles` with `role = 'operator'`
  for that user.

Do **not**:

- Paste a service role key anywhere.
- Share a user UUID in public chat, screenshots, or copy.
- Grant operator to shared/test accounts that are also used for customer
  demos.

## Step 4 — Re-test in the preview

1. Sign out of the embedded preview.
2. Sign back in as the operator-role account.
3. Navigate to `/operator/demo-preview`.
4. Expect the read-only One-Tent Evidence Chain walkthrough (no
   mutation controls, no automation, no device control).

If the gate still renders, the most likely causes are:

- A different account is signed into the preview than was granted the
  role.
- The role row was inserted in a different project than the preview is
  pointed at.

## Do-not list (hard rules)

- Do **not** make `/operator/demo-preview` a public route.
- Do **not** add a bypass query param (e.g. `?operator=1`).
- Do **not** add a demo-only auth shortcut.
- Do **not** weaken `RequireOperatorRole` or `useHasRole`.
- Do **not** add a client-callable seed helper.
- Do **not** expose user IDs, role rows, JWT claims, or service role
  values in any UI surface.

## Rollback

This document is reference-only. No code or DB rollback is required to
remove or revise it.

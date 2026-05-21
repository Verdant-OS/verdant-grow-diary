# Verdant

Verdant is a grow-operations dashboard ("Grow OS") for cultivators. It helps
operators monitor environments, capture diary entries, review sensor data, and
work through an approval-required Action Queue. Verdant is read-only against
hardware by default — no device-command code ships without an explicit safety
review.

The frontend is React + Vite + TypeScript + Tailwind + shadcn/ui. The backend
is Supabase (Postgres + Auth + Edge Functions) exposed to the app as
"Lovable Cloud".

**Production:** https://verdantgrowdiary.com

A public landing page at `/welcome` explains the product to visitors
without exposing private dashboard data.

---

## Project overview

- **Frontend:** React 18, Vite, TypeScript, Tailwind, shadcn/ui, Recharts,
  lucide-react.
- **Backend:** Supabase (Postgres, Auth, Edge Functions) via Lovable Cloud.
- **Auth:** Supabase Auth. Every user-owned table is gated by Row Level
  Security keyed on `auth.uid()`.
- **AI:** AI Coach is read-only and suggest-only. It never executes Action
  Queue items or writes to device-control surfaces.
- **Tests:** Vitest. The suite is the safety net for security, RLS, AI Coach,
  Action Queue, and sensor-truthfulness guarantees.

---

## Local development

```bash
bun install
bun run dev
```

The dev server runs on Vite's default port. The app expects a Supabase
project; see [Environment variables](#environment-variables) and
[Supabase setup](#supabase-setup).

---

## Environment variables

The `.env` file is managed by Lovable Cloud and should not be edited by hand.
It provides:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

`service_role` keys must never appear in the frontend, in Edge Functions, or
in any committed file. See the
[security checklist](docs/security-checklist.md) for the full rule.

---

## Supabase setup

- Migrations live under `supabase/migrations/` and are applied via the
  Lovable Cloud migration tooling.
- Every new table must enable RLS and define explicit `SELECT` / `INSERT` /
  `UPDATE` / `DELETE` policies anchored on `auth.uid()`.
- The Supabase types in `src/integrations/supabase/types.ts` and the client in
  `src/integrations/supabase/client.ts` are auto-generated — do not edit them
  by hand.
- For local Supabase setup details, see `docs/LOCAL_SUPABASE_SETUP.md`.

---

## Testing commands

Run these before opening a PR:

```bash
bunx vitest run
bunx eslint <changed files>
npm run build
```

All existing tests must continue to pass. New behavior ships with new tests.

---

## Security workflow

Every change is reviewed against [`docs/security-checklist.md`](docs/security-checklist.md).
Accepted, documented warnings are tracked in
[`docs/security-exceptions.md`](docs/security-exceptions.md). Adding a new
exception requires a justification, safety controls, and a regression test.

Core architecture rules:

- **RLS is the ownership boundary.** Authorization lives in Postgres policies,
  not in the client.
- **Never trust client-provided `user_id`.** The server re-derives ownership
  via `auth.uid()` on every write.
- **AI Coach is read-only** unless a change has been explicitly safety-reviewed.
- **Action Queue is approval-required and suggest-only.** Nothing executes
  without an explicit user action; `action_queue_events` is append-only.
- **Sensor data must never be faked as live.** Stale, missing, or suspicious
  readings are surfaced as such — never silently substituted.
- **External-control / device-command code requires explicit safety review.**
  Integrations stay read-only adapters by default.

---

## PR workflow

Pull requests use [`.github/pull_request_template.md`](.github/pull_request_template.md),
which enforces:

- Summary, files changed, behavior changed.
- Security checklist (no client-trusted `user_id`, no `service_role`, RLS
  preserved, no fake live/demo data, no device-command surface, AI Coach and
  Action Queue safety, tests added/updated).
- Impact sections for RLS, AI Coach, Action Queue, sensor truthfulness, and
  external control.
- Tests run and build/lint results.
- Risk and rollback notes.

---

## AI Coach safety

- AI Coach must not be invoked from new surfaces without review.
- AI Coach output cannot trigger unattended changes to user data, devices, or
  the Action Queue.
- Safety regressions are caught by `src/test/ai-coach-security.test.ts` and
  `src/test/ai-coach-output-safety.test.ts`.

## Action Queue safety

- Items remain user-approved before any side effect runs.
- No code path may auto-approve, auto-complete, or auto-cancel queue items.
- `action_queue_events` is append-only (no `UPDATE` / `DELETE`).
- Safety regressions are caught by `src/test/action-queue-safety.test.ts` and
  `src/test/action-queue-audit.test.ts`.

## Sensor / live-data truthfulness

- Dashboards display only real readings from authenticated sources.
- Stale, missing, or suspicious data is labeled, not hidden or fabricated.
- Demo/mock data, if present, is clearly labeled and gated.

---

## Grow-scoped navigation pattern

Verdant uses a "scoped grow" navigation contract: when a grow is selected,
the Dashboard, Plants, Tents, Timeline, Action Queue, and Logs surfaces all
filter to that grow. The contract is enforced by
`src/hooks/useScopedGrow.ts` and the tests under
`src/test/scoped-grow-navigation-contract.test.tsx`. New surfaces that show
grow-owned data should honor the scoped grow rather than ignore it.

---

## Known accepted security exception

- **Supabase linter 0029** — `public.has_role(uuid, public.app_role)` is a
  `SECURITY DEFINER` function required for non-recursive RLS role checks on
  `public.user_roles`. It is `STABLE`, has `search_path` pinned to `public`,
  returns `boolean` only, filters by the supplied `_user_id`, performs no
  writes, uses no dynamic SQL, and is not granted to `anon` or `public`.
  See [`docs/security-exceptions.md`](docs/security-exceptions.md) and the
  regression tests in `src/test/has-role-security-definer.test.ts`.

This is the only currently accepted `SECURITY DEFINER` helper. New ones must
go through the review process in the
[security checklist](docs/security-checklist.md).

# Pheno Tracker paid-user smoke test local setup

This guide gets `bun run test:pheno-paid-smoke` running end-to-end against a
**local** Supabase stack — never production, never Lovable Cloud.

The smoke test covers:

- Free user → gated Pheno route → Upgrade `returnTo`
- Paddle checkout success → entitlement confirmed
- Pheno Hunt creation
- Workspace evidence progress
- `/compare` disabled until required evidence is present
- `/compare` enabled once the hunt is comparison-ready

Every scenario is env-gated: missing inputs skip cleanly with a printed
reason. Nothing is faked.

---

## A. Prerequisites

- Docker Desktop (or another compatible container runtime) installed and
  **running**.
- Supabase CLI installed (`brew install supabase/tap/supabase`,
  `scoop install supabase`, or `npm i -g supabase`).
- Repo dependencies installed with `bun install`.
- **Do not** run this seeder or smoke test against the hosted Lovable Cloud
  Supabase project. The seeder refuses to run against any host ending in
  `supabase.co`, `supabase.in`, `lovable.app`, or `lovable.dev`.

Supabase local development requires a Docker-compatible container runtime.

---

## B. Start local Supabase

```bash
supabase start
supabase status
```

Note the printed **API URL** (usually `http://127.0.0.1:54321`), **anon
key**, and **service_role key**. These come from the local stack and are
safe on your machine — never paste them into chat, PRs, or CI logs.

Apply the project's migrations against the local stack (this project's
migrations live in `supabase/migrations/`):

```bash
supabase db reset       # applies migrations + seed to the local DB
```

---

## C. Export local env vars

Create a `.env.pheno-paid-smoke.local` (gitignored — never commit) and
source it before running the seeder / smoke:

```bash
# Local Supabase (never a hosted host)
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="<local anon key from supabase status>"
export SUPABASE_SERVICE_ROLE_KEY="<local service_role from supabase status>"

# Test account credentials (create these accounts locally — see step D)
export E2E_PHENO_FREE_EMAIL="free@pheno.local"
export E2E_PHENO_FREE_PASSWORD="<local-only password>"
export E2E_PHENO_PRO_EMAIL="pro@pheno.local"
export E2E_PHENO_PRO_PASSWORD="<local-only password>"
export E2E_PHENO_FOUNDER_EMAIL="founder@pheno.local"
export E2E_PHENO_FOUNDER_PASSWORD="<local-only password>"
export E2E_PHENO_CANCELED_EMAIL="canceled@pheno.local"
export E2E_PHENO_CANCELED_PASSWORD="<local-only password>"

# App under test
export E2E_BASE_URL="http://localhost:8080"
```

`SUPABASE_SERVICE_ROLE_KEY` must **never** be exposed to browser code. It
is only read by the local seeder.

---

## D. Create the four test accounts (local)

Sign up through the running app (`/auth`) as:

| Role                      | Entitlement                      |
| ------------------------- | -------------------------------- |
| Free user                 | none                             |
| Pro user                  | active Pro subscription          |
| Founder Lifetime user     | founder lifetime                 |
| Canceled/expired user     | previously Pro, now canceled     |

Assign entitlements the same way you would in production — never by pasting
`service_role` in the browser. The Pro / Founder / Canceled accounts need
to land in `public.billing_subscriptions` with the appropriate state.

---

## E. Preflight

```bash
bun run test:pheno-paid-smoke:preflight
```

Every input is reported as `PRESENT`, `SEEDABLE`, `SKIPPED`, or `BLOCKED`.
Missing env vars are listed by **name only** — never by value. If the
Supabase URL points at a hosted host, preflight fails with a clear error.

---

## F. Mint auth sessions

```bash
bun run test:pheno-paid-smoke:sessions
```

For each role whose email + password are set, this signs in through `/auth`
in a headless browser and writes `e2e/.auth/pheno-<role>.json` (gitignored).
Then export the session file paths:

```bash
export E2E_PHENO_FREE_SESSION_FILE="e2e/.auth/pheno-free.json"
export E2E_PHENO_PRO_SESSION_FILE="e2e/.auth/pheno-pro.json"
export E2E_PHENO_FOUNDER_SESSION_FILE="e2e/.auth/pheno-founder.json"
export E2E_PHENO_CANCELED_SESSION_FILE="e2e/.auth/pheno-canceled.json"
```

---

## G. Seed pheno fixtures

```bash
bun run test:pheno-paid-smoke:seed
```

Seeds against the local Supabase, using the owner resolved from
`E2E_PHENO_PRO_EMAIL` (falls back to `E2E_PHENO_FOUNDER_EMAIL`):

| Fixture                                     | Status    |
| ------------------------------------------- | --------- |
| `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE`        | seeded    |
| `E2E_PHENO_HUNT_ID_PENDING_HARVEST`         | seeded    |
| `E2E_PHENO_HUNT_ID_PENDING_CURE`            | seeded    |
| `E2E_PHENO_HUNT_ID_COMPARISON_READY`        | seeded    |
| `E2E_PHENO_HUNT_ID_REPLICATION_PENDING`     | n/a — signal not persisted; engine treats as satisfied |

The comparison-ready fixture writes real evidence rows into
`pheno_candidate_scores`, `pheno_smoke_tests`, and `pheno_lab_results` so
the compare route's readiness engine actually resolves to
`comparison_ready`.

The seeder writes `e2e/.fixtures/pheno-paid-smoke.env` (gitignored). Source
it before running the smoke:

```bash
set -a; source e2e/.fixtures/pheno-paid-smoke.env; set +a
```

---

## H. Run the smoke

```bash
bun run test:pheno-paid-smoke
```

Interpretation:

- **PASS** — scenario ran and assertions held.
- **SKIPPED** — required env / fixture / session missing. Not a failure.
- **BLOCKED** — a hard prerequisite is missing (e.g. a session file path
  points at an unreadable file, or the Paddle iframe step needs manual
  exercise).
- **FAIL** — real regression. Investigate before publishing.

---

## Safety reminders

- Never paste emails, passwords, cookies, session tokens, `service_role`,
  or hunt ids into chat, PRs, or CI logs.
- Never commit `e2e/.auth/*` or `e2e/.fixtures/*` (both gitignored).
- Never set `SUPABASE_SERVICE_ROLE_KEY` in any browser-visible env
  (`VITE_*`, HTML, client bundle).
- Cleanup between runs: `rm -rf e2e/.auth e2e/.fixtures`.

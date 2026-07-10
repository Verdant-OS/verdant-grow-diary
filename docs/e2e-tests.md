# Pheno Tracker E2E — Disabled Compare & Anchor Coverage

Playwright E2E specs that prove disabled "Compare candidates" states stay
visually stable, accessible, inert, and free of verdict/keeper/ranking copy.

## Product rules under test

- **Setup complete** = the hunt has candidates and evidence goals and is
  ready to use for tracking.
- **Comparison-ready** = enough recorded evidence exists to compare
  candidates honestly.
- A hunt can be **Setup complete** and still **Not comparison-ready**.
- Missing-evidence next-step links may deep-link to a workspace anchor to
  help the grower record what's missing — they **never** enable
  Compare candidates by themselves.
- `replication_readiness` is intentionally **inert**: no anchor, no
  scroll target, no route/hash change on interaction.

## Specs

| Spec | What it proves |
| ---- | -------------- |
| `e2e/pheno-disabled-compare-visual-regression.spec.ts` | One scenario per disabled reason. Asserts disabled button, `aria-describedby` helper, exact reason copy, no `/compare` link, no forbidden verdict/keeper/ranking copy. Captures a region screenshot artifact per reason. |
| `e2e/pheno-disabled-compare-workspace-navigation.spec.ts` | Compare stays disabled and helper reason unchanged after intra-workspace navigation (desktop + mobile). |
| `e2e/pheno-disabled-compare-direct-navigation.spec.ts` | Direct `/pheno-hunts/:id/compare` navigation shows the "Not comparison-ready yet" warning, exposes no active comparison / ranking / verdict / keeper UI, links back to the workspace, and fires no comparison-execution / ranking / keeper / AI-comparison / Action Queue write network requests. |
| `e2e/pheno-workspace-missing-evidence-anchors.spec.ts` | Missing-evidence next-step links point at `/pheno-hunts/:id/workspace#<anchor>` (never `/compare`). Clicking scrolls to the target and Compare stays disabled. |
| `e2e/pheno-comparison-visual-regression.spec.ts` | Public `/pheno-comparison` demo + optional authenticated `/compare` and workspace snapshots. |


## Fixture env vars

Each disabled scenario is gated on an explicit env var pointing at a hunt
whose workspace is currently in that state. **Missing vars skip cleanly**
with a printed reason — nothing is faked.

```bash
E2E_PHENO_HUNT_ID_MISSING_EVIDENCE=<hunt id>
E2E_PHENO_HUNT_ID_PENDING_HARVEST=<hunt id>
E2E_PHENO_HUNT_ID_PENDING_CURE=<hunt id>
E2E_PHENO_HUNT_ID_REPLICATION_PENDING=<hunt id>
```

Auth: these specs use `e2e/lib/authedTest.ts`. Provide either a
pre-generated `e2e/.auth/user.json` + `e2e/.auth/session-storage.json` or
`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` — see `e2e/auth.setup.ts`.

## Running

```bash
bunx playwright test e2e/pheno-disabled-compare-visual-regression.spec.ts
bunx playwright test e2e/pheno-disabled-compare-workspace-navigation.spec.ts
bunx playwright test e2e/pheno-disabled-compare-direct-navigation.spec.ts
bunx playwright test e2e/pheno-workspace-missing-evidence-anchors.spec.ts

# Env-aware runner (skips cleanly if no fixture env vars are set):
bun run test:pheno-disabled-compare-e2e
```

Screenshots are written under `e2e/screenshots/` and uploaded by the
`Pheno disabled Compare E2E` workflow as the
`pheno-disabled-compare-screenshots` artifact (14-day retention, uploaded
with `if: always()` so partial-skip runs still preserve any rendered
images). This repo does **not** maintain committed pixel baselines — copy,
structure, and network assertions are the real guard.

## Network denylist

The direct-navigation spec fails if any of these fire while Compare is
disabled: `/compare-candidates`, `/pheno-comparison-result`,
`/pheno-rank`, `/keeper-recommendation`, `/comparison-verdict`,
`/ai*comparison`, and any write (`POST`/`PUT`/`PATCH`/`DELETE`) against
`pheno_comparison*` / `pheno_conclusion*` / `pheno_rank*` /
`pheno_keeper*` / `action_queue`. Ordinary read-only fetches (hunt row,
candidates, evidence, static assets) are allowed.


## Forbidden copy matrix

The visual spec asserts none of these appear in any disabled Compare
surface:

`winner`, `winning candidate`, `best candidate`, `best pheno`,
`top candidate`, `ranked candidate`, `candidate ranking`,
`final ranking`, `verdict`, `final verdict`, `comparison verdict`,
`recommended keeper`, `keeper recommendation`, `keeper selected`,
`keeper confirmed`, `selection winner`, `AI picked`, `AI picks winners`,
`guaranteed keeper`, `guaranteed yield`, `automated breeding`.

## Safety

Read-only. No schema, RLS, entitlement, scoring, AI, Action Queue, or
device-control changes. Only real evidence changes may flip a hunt to
comparison-ready — navigation, focus, or clicking inert items cannot.


## Pheno Tracker paid-user smoke

`e2e/pheno-tracker-paid-user-smoke.spec.ts` covers the Free → Pro →
Pheno Hunt journey end-to-end. Every scenario is env-gated: missing
inputs skip cleanly with a printed reason. Nothing is faked.

### Required accounts / sessions

Provide either session files (preferred) OR email+password pairs:

- `E2E_PHENO_FREE_SESSION_FILE` OR `E2E_PHENO_FREE_EMAIL` + `E2E_PHENO_FREE_PASSWORD`
- `E2E_PHENO_PRO_SESSION_FILE` OR `E2E_PHENO_PRO_EMAIL` + `E2E_PHENO_PRO_PASSWORD`
- `E2E_PHENO_FOUNDER_SESSION_FILE` OR `E2E_PHENO_FOUNDER_EMAIL` + `E2E_PHENO_FOUNDER_PASSWORD` (optional)
- `E2E_PHENO_CANCELED_SESSION_FILE` OR `E2E_PHENO_CANCELED_EMAIL` + `E2E_PHENO_CANCELED_PASSWORD` (optional)

### Required fixture ids

- `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE` (required for D–F)
- `E2E_PHENO_HUNT_ID_COMPARISON_READY` (required for G)
- `E2E_PHENO_HUNT_ID_PENDING_HARVEST`, `_PENDING_CURE`, `_REPLICATION_PENDING` (optional)

### Local fixture seeding

Local Supabase + `service_role` required. See
[docs/pheno-paid-smoke-local-setup.md](./pheno-paid-smoke-local-setup.md)
for the full local setup (Docker + `supabase start` + test accounts +
`bun run test:pheno-paid-smoke:seed`). The seeder writes real evidence
rows so `comparison-ready` is produced by the same code path the app uses
— nothing is faked. **Never** seed against hosted Supabase and **never**
paste `service_role`, cookies, passwords, or hunt ids into chat.

### Running

```bash
bun run test:pheno-paid-smoke:preflight   # PRESENT / SEEDABLE / SKIPPED report
bun run test:pheno-paid-smoke:seed        # seed local fixtures (local Supabase only)
bun run test:pheno-paid-smoke             # preflight + Playwright smoke
```

### Automated vs manual steps

| Step | Automation |
| ---- | ---------- |
| A. Free gate + returnTo on Upgrade CTA | Automated |
| B. CheckoutSuccess sanitization + entitlement wait | Automated (route contract only) |
| B. Paddle iframe payment | **MANUAL** — iframe is cross-origin |
| C. Pro hunt creation flow | Requires Pro session + fixture; automated when inputs present |
| D–F. Disabled Compare / direct incomplete /compare | Automated with `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE` |
| G. Comparison-ready enable + read-only render | Automated with `E2E_PHENO_HUNT_ID_COMPARISON_READY` |
| H. Canceled/expired write attempt | Automated when canceled session present |
| I. Core one-tent regression | Automated (smoke asserts dashboard resolves) |

### Interpreting results

- **PASS** — scenario ran and assertions held.
- **SKIPPED** — required env/fixture missing. Not a failure.
- **BLOCKED** — env claims a session file but the file is unreadable, or
  Paddle iframe payment must be exercised manually.
- **FAIL** — real regression. Investigate before publishing.

### Safety

Never paste passwords, cookies, session tokens, `service_role`, or hunt
ids into chat, PR descriptions, or CI logs. The preflight script prints
only `PRESENT` / `SKIPPED` — never the value.

## Pheno Tracker paid-user smoke — session & fixture harness

Scripts:

- `bun run test:pheno-paid-smoke:preflight` — presence check only; never
  prints secret values. Exits 0 on clean SKIP, 1 only if a session env var
  points to an unreadable file.
- `bun run test:pheno-paid-smoke:sessions` — signs into `/auth` in a
  headless browser for each role whose email + password env vars are set,
  and writes:
  - `e2e/.auth/pheno-free.json` + `.session-storage.json`
  - `e2e/.auth/pheno-pro.json` + `.session-storage.json`
  - `e2e/.auth/pheno-founder.json` + `.session-storage.json`
  - `e2e/.auth/pheno-canceled.json` + `.session-storage.json`
- `bun run test:pheno-paid-smoke:seed` — seeds pheno fixtures against a
  **local** Supabase (refuses hosted hosts). Produces missing-evidence,
  pending-harvest, pending-cure, and comparison-ready hunts by writing
  real evidence into `pheno_candidate_scores`, `pheno_smoke_tests`, and
  `pheno_lab_results`. Writes ids to `e2e/.fixtures/pheno-paid-smoke.env`
  (gitignored). See `docs/pheno-paid-smoke-local-setup.md`.
- `bun run test:pheno-paid-smoke` — runs preflight, then the paid-user
  Playwright smoke. Every scenario is env-gated; missing inputs skip
  cleanly with a reason.

Required env vars (all optional; missing = SKIPPED):

```
E2E_BASE_URL
E2E_PHENO_FREE_EMAIL / E2E_PHENO_FREE_PASSWORD
E2E_PHENO_PRO_EMAIL / E2E_PHENO_PRO_PASSWORD
E2E_PHENO_FOUNDER_EMAIL / E2E_PHENO_FOUNDER_PASSWORD
E2E_PHENO_CANCELED_EMAIL / E2E_PHENO_CANCELED_PASSWORD
E2E_PHENO_FREE_SESSION_FILE     (=> e2e/.auth/pheno-free.json)
E2E_PHENO_PRO_SESSION_FILE      (=> e2e/.auth/pheno-pro.json)
E2E_PHENO_FOUNDER_SESSION_FILE  (=> e2e/.auth/pheno-founder.json)
E2E_PHENO_CANCELED_SESSION_FILE (=> e2e/.auth/pheno-canceled.json)
E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
E2E_PHENO_HUNT_ID_COMPARISON_READY
```

Local workflow:

1. Create four test accounts in the running app; assign entitlements
   through the normal admin UI (never by pasting service_role in the
   browser).
2. Export the credential env vars locally (never commit them).
3. `bun run test:pheno-paid-smoke:sessions` to mint storageState files.
4. Export `E2E_PHENO_*_SESSION_FILE` pointing at the generated JSON.
5. Seed hunt fixtures manually via the UI until the seed script is
   unblocked, and export `E2E_PHENO_HUNT_ID_*` accordingly.
6. `bun run test:pheno-paid-smoke`.

Result taxonomy:

- **PASS** — scenario ran and asserted successfully.
- **SKIPPED** — required env/session/fixture missing; expected in CI and
  in Lovable Cloud sandbox.
- **BLOCKED** — a script refused to run because a hard prerequisite is
  missing (e.g. seed script waiting on schema confirmation).
- **FAIL** — assertion failed, or a session env var pointed at an
  unreadable file.

Safety reminders:

- Do NOT paste real credentials into chat.
- Do NOT commit `e2e/.auth/*` or `e2e/.fixtures/*` (gitignored).
- Do NOT set `SUPABASE_SERVICE_ROLE_KEY` in any browser-visible env.
- Cleanup: `rm -rf e2e/.auth e2e/.fixtures` between runs to force a
  fresh session mint.

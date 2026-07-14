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

Canonical one-command local run (Docker + local Supabase required):

```bash
bun run test:pheno-paid-smoke:local
```

This runs preflight → seed → load fixture env → hydration verify →
sessions → Playwright, and returns exit 0 on PASS, 1 on FAIL, and 2 on
SKIPPED / BLOCKED (Playwright is never launched in that case).

Individual commands for debugging:

```bash
bun run test:pheno-paid-smoke:preflight     # PRESENT / SEEDABLE / SKIPPED report
bun run test:pheno-paid-smoke:seed          # seed local fixtures (local Supabase only)
bun run test:pheno-paid-smoke:verify        # exercise adapter + readiness on the seeded fixture
bun run test:pheno-paid-smoke:sessions      # mint Playwright storageState per role
bun run test:pheno-paid-smoke                # preflight + Playwright smoke
bun run test:pheno-paid-smoke:verify-tests  # unit + CLI tests for the verifier and orchestrator
```

### Automated vs manual steps

| Step | Automation |
| ---- | ---------- |
| A. Free gate + returnTo on Upgrade CTA | Automated — gate and CTA asserted affirmatively (visible testids, exact `/pricing?returnTo=%2Fpheno-hunts%2Fnew` href, click-through renders plan content); an `/auth` bounce or absent gate/CTA FAILS |
| B. CheckoutSuccess sanitization + entitlement wait | Automated (route contract only) |
| B. Paddle iframe payment | **MANUAL** — iframe is cross-origin; no real charge is ever performed |
| C. Pro hunt creation flow | Requires Pro session + fixture; automated when inputs present |
| D–F. Disabled Compare / direct incomplete /compare | Automated with `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE` — required assertions: disabled state, EXACT not-ready reason copy (pinned per `data-readiness` from the readiness view model), and missing-evidence anchor click-through (same-workspace hash navigation, target attached, Compare stays disabled) |
| G. Comparison-ready enable + read-only render | Automated with `E2E_PHENO_HUNT_ID_COMPARISON_READY` — enabled Compare link with exact hunt route, then substantive content: live mode, ≥2 candidate surfaces with non-empty labels, ≥1 hydrated expression/evidence field, read-only badge, zero action controls inside the surface |
| H. Canceled/expired write attempt | Automated when canceled session present — gate asserted affirmatively |
| I. Core one-tent regression | Automated (smoke asserts dashboard resolves) |

A static contract suite
(`src/test/pheno-live-smoke-assertion-contract.test.ts`, run via
`bun run test:pheno-live-smoke:contract`) prevents these required
assertions from regressing to conditional `if (count())` patterns or
silent early returns, and pins the checkpoint mapping to the spec's
actual test titles. The live smoke never performs a real Paddle charge,
never seeds production fixtures, and never produces a keeper/winner
recommendation.

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
5. `bun run test:pheno-paid-smoke:seed` to seed pheno hunt fixtures
   locally, then `set -a; source e2e/.fixtures/pheno-paid-smoke.env; set +a`.
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

## Pheno Tracker live release smoke (production)

The production release gate is a three-part sequence — local-only
preflight → deployed-build fingerprint → live role smoke — followed by an
automated release receipt. It runs against the fixed target
`https://verdantgrowdiary.com` only, uses dedicated production test
accounts and existing production-safe fixture hunts, and **never seeds
production**. `service_role` is never used; if
`SUPABASE_SERVICE_ROLE_KEY` is present the preflight warns.

### Commands

One command runs the whole gate (stages 1–8):

```bash
bun run release:pheno:live-gate
```

It chains working-copy safety → credential-file verification (must exist,
resolve inside the repo, and be gitignored; override the default
`e2e/.fixtures/pheno-live-smoke.env` path with `PHENO_LIVE_SMOKE_ENV_FILE`)
→ preflight → deployed-build fingerprint (expected identity must MATCH) →
live role smoke → schema evidence → manual evidence → receipt write +
validation → final repository safety. Credentials load into child-process
environments only; `SUPABASE_SERVICE_ROLE_KEY` is stripped; values are
never printed or persisted. **Run locally only** — credentials must never
enter Lovable, chat, or CI logs. Exit codes: `0` validated GO · `1`
failure/unsafe/malformed · `2` HOLD/BLOCKED (missing evidence — **exit 2
is not a PASS**). It writes only redacted release evidence
(`release-gate-summary.{json,md}` plus the per-stage artifacts below).

Individual stages for debugging:

```bash
bun run test:pheno-live-smoke:preflight   # local-only; prints variable NAMES, no network
bun run release:pheno:build-id            # fetch + fingerprint the deployed bundle
bun run test:pheno-live-smoke             # full runner: preflight → reachability → fingerprint → sessions → Playwright
bun run release:pheno:receipt             # write the receipt; GO exits 0, HOLD exits 2
bun run release:pheno:receipt:partial     # refresh a HOLD receipt before all evidence exists (never GO)
bun run release:pheno:receipt:validate    # decide whether GO is allowed (policy gates above the writer)
```

### Required local inputs (names only — never paste values)

The confirmation gate plus four role credential pairs and two fixture
hunt ids; the full list is printed by the preflight:

```
E2E_PHENO_LIVE_SMOKE_CONFIRM=RUN_LIVE_PHENO_SMOKE
E2E_PHENO_{FREE,PRO,FOUNDER,CANCELED}_{EMAIL,PASSWORD}
E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
E2E_PHENO_HUNT_ID_COMPARISON_READY
```

### Exit codes (preflight and runner)

- **0 READY / PASS** — all inputs present and valid; smoke passed.
- **1 FAIL** — invalid confirmation value, `E2E_BASE_URL` conflicting
  with the fixed production target, deployment/fingerprint failure, or a
  failed/skipped live test. Missing inputs are never treated as PASS.
- **2 BLOCKED** — required local inputs missing. The runner exits before
  any network request, session mint, or Playwright launch.

### Build fingerprint

`release:pheno:build-id` fetches production HTML, resolves the main Vite
bundle **same-origin only**, and records timestamp, page title, HTTP
status, bundle path/filename/id, byte length, SHA-256, ETag, and
Last-Modified to
`artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json`.
If `PHENO_EXPECTED_LIVE_BUILD_ID` is set it must EXACTLY match the bundle
id or filename, or be a ≥8-char hex prefix of the SHA-256 — a mismatch is
FAIL (exit 1). If unset the artifact records `NOT SET`; reachability
alone never claims release identity.

### Release receipt

`release:pheno:receipt` reads four redacted artifacts (live smoke
summary, schema spot-check, deployed build, manual release checks) and
writes `docs/releases/pheno-tracker-pro-release-receipt.md` with a
GO/HOLD decision. GO requires ALL of: production reachable, expected
build identity match, no white screen, no console errors, schema
spot-check PASS (3 onboarding columns, exactly 1 entitlement function,
13/13 RESTRICTIVE Pro tables, owner SELECT verified), live smoke PASS
with zero failed and zero skipped tests, all 12 checkpoints PASS,
billing disposition resolved, and complete rollback readiness. Anything
less is HOLD. Checkpoints auto-populate only when a matching Playwright
test proves them; checkpoint 6 (hunt setup persistence) has no automated
proof in the live smoke and stays PENDING unless
`manual-release-checks.json` records manual evidence. Checkpoint 9
(missing-evidence navigation) now has automated anchor click-through
proof in the live smoke; under current release policy its separate
manual evidence requirement still applies at receipt time unless a
policy decision explicitly removes it — the receipt validator and the
one-command gate both enforce it. Checkpoint 8 requires exact
helper-copy proof (pinned per readiness from the view model), not
helper presence. Checkpoints 1, 2, 8, and 11 map
to affirmative live assertions (gate/CTA existence, exact returnTo
round-trip, exact not-ready reason copy, substantive comparison
content).

### Safety

- Artifacts under `artifacts/` and sessions under `e2e/.auth/` are
  gitignored and contain redacted evidence only — no credentials,
  cookies, tokens, emails, or fixture ids.
- Playwright traces are disabled on real-auth runs (the runner sets the
  sentinel automatically).
- Tests for this tooling (`src/test/pheno-live-release-tooling.test.ts`)
  never contact production — CLI tests only exercise paths that exit
  before any network request.

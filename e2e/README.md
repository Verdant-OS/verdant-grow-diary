# Verdant Grow OS — Authenticated Playwright Smoke

Playwright is the source of truth for browser-level Quick Log keyboard,
focus, and post-save flows. Vitest covers deterministic component logic in
jsdom but cannot prove real Tab order or focus restoration.

## ⚠️ Test-fixture requirement (real-write warning)

The Quick Log smoke drives the real authenticated UI and **creates real
diary entries** on whatever grow/plant the configured account can access.
There is no app-level write bypass, no fixture rewrite, no automatic
cleanup, and no teardown. Every Quick Log save the smoke performs is a
real, persisted diary entry — exactly like a grower clicking Save.

The smoke and its fixture check (`bun run e2e:verify-fixture`) run against
production only: `https://verdantgrowdiary.com`, signed in as the approved
disposable smoke account `cheekhimself@gmail.com`. That is the owner's
2026-09-28 decision in
[`docs/production-only-verification-runbook.md`](../docs/production-only-verification-runbook.md);
there is no non-production smoke host. The fixture guard refuses any other
app host, backend or account before the first write, and every note the smoke
saves is tagged `[smoke <ISO timestamp>]`.

Because of this:

- **Do not point `E2E_GROW_1_PLANT_URL` at a real active grow.** Pointing
  the smoke at a production grow will pollute that grow's diary with test
  entries that the app does not roll back.
- **Use only a dedicated test account and a dedicated test plant.** The
  account must own the test plant and must not own real grower data you
  care about. Never use `matt@verdantgrowdiary.com`, the KEEP account or a
  customer account.
- **Until a disposable test fixture exists, run the workflow manually
  only.** There is intentionally no scheduled/nightly trigger — automated
  scheduled smoke against a real grow is unsafe and is not enabled.
- No automatic data cleanup, deletion, or mutation of existing grow data
  happens outside the intentional Quick Log save flow itself.

## Write-risk playbook

For the full strategy (read vs write split, fixture garden, create/delete,
denylist, and #570 residue prune), see:

**[`docs/cleanup/e2e-test-data-management.md`](../docs/cleanup/e2e-test-data-management.md)**

Write-producing **pheno** smokes (`e2e:pheno-journey`, workspace integrity)
call `assertPhenoWriteFixtureEnv` + `assertGrowAllowedForWriteSmoke` and name
hunts with `buildE2eHuntName` (never append to the wizard prefill).

## Safety guarantees

- No app-level auth bypass.
- No hardcoded credentials in the repo.
- No `service_role` or bridge tokens in browser context.
- No localStorage token injection (unless produced by a real Playwright login).
- No fake live sensor data; stale/non-usable snapshots are never attached.
- No Action Queue / device-control writes.
- No scheduled/nightly trigger in the CI workflow — the smoke runs only on
  manual `workflow_dispatch` or on `push` / `pull_request` to
  `verdant-grow-diary`, and skips cleanly when E2E config is unavailable.
- `e2e/.auth/user.json` is generated locally and is gitignored. Never commit it.
- `e2e/results/` is gitignored. Never commit it.

## Required env

| Name                                | Purpose                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E2E_BASE_URL`                      | Base URL of the app. For the Quick Log smoke and `e2e:verify-fixture` it must be `https://verdantgrowdiary.com`. Credential-free mocked specs may use a local dev server (e.g. `http://127.0.0.1:8080` from `bun run dev -- --host 127.0.0.1 --port 8080`); if unset, Playwright starts its own server on `http://localhost:5173`.               |
| `E2E_GROW_1_PLANT_URL`              | `https://verdantgrowdiary.com/plants/<plant-uuid>` for the smoke account's Grow #1 test plant. Optional `tentId` / `growId` query values must be UUIDs that match that plant's tent and grow. Any other query key, credentials or a fragment is refused.                                                                                         |
| `E2E_TEST_EMAIL`                    | Login email for the smoke account                                                                                                                                                                                                                                                                                                                |
| `E2E_TEST_PASSWORD`                 | Login password for the smoke account                                                                                                                                                                                                                                                                                                             |
| `E2E_GROW_1_SECOND_PLANT_NAME`      | Optional. Same-grow/tent target; defaults to `E2E Test Plant 2`                                                                                                                                                                                                                                                                                  |
| `E2E_FIXTURE_MODE`                  | Must be exactly `"true"` for any write-producing smoke run                                                                                                                                                                                                                                                                                       |
| `E2E_FIXTURE_EXPECTED_TENT_NAME`    | Expected disposable E2E tent name (e.g. `E2E Test Tent`)                                                                                                                                                                                                                                                                                         |
| `E2E_FIXTURE_EXPECTED_PLANT_NAME`   | Expected disposable E2E plant name (e.g. `E2E Test Plant`)                                                                                                                                                                                                                                                                                       |
| `E2E_FIXTURE_EXPECTED_GROW_NAME`    | **Optional.** If set, it must be an E2E/Test/QA name (e.g. `E2E Test Grow`) and match the owned, active grow row. If omitted, the smoke takes the name from that row and keeps it for later saves.                                                                                                                                               |
| `E2E_FIXTURE_EXPECTED_ACCOUNT_HINT` | **Optional.** If set, it must be `cheekhimself@gmail.com`; any other value is refused. The guard checks the signed-in server identity either way. Never a password or token.                                                                                                                                                                     |
| `TESTDINO_TOKEN`                    | **Optional.** Project API key for [TestDino live streaming](https://docs.testdino.com/guides/playwright-real-time-test-streaming). Results stream during the Playwright run — there is no post-run upload. Leave unset in CI unless Cheek adds a secret; `playwright.config.ts` only attaches `@testdino/playwright` when this var is non-empty. |

`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are only required to (re)generate
`e2e/.auth/user.json`. Once that file exists, the smoke run reuses it.

## Disposable E2E fixture

The Quick Log smoke is write-producing and must **never** run against a
real active grow. Before the smoke is allowed to run, the workflow
executes `bun run e2e:verify-fixture`, which signs in with the
dedicated test account, opens `E2E_GROW_1_PLANT_URL`, and hard-fails
unless the visible page is clearly a disposable E2E fixture.

Required setup before enabling CI smoke (current UI flow — no Grow page):

1. Use the approved dedicated test account, `cheekhimself@gmail.com`. It
   must own **no real grower data**.
2. Sign in as that account on `https://verdantgrowdiary.com` and follow the normal in-app flow:
   1. From the Dashboard, **Add Tent**.
   2. Name the tent exactly **`E2E Test Tent`**.
   3. Open that tent and **Add Plant**.
   4. Name the plant exactly **`E2E Test Plant`**.
   5. Copy the plant detail URL — this becomes `E2E_GROW_1_PLANT_URL`.
   6. Optional second plant **`E2E Test Plant 2`** in the same tent/grow if
      the smoke target-transition step is in scope.
   7. Optional grow named **`E2E Test Grow`** only if/when the UI
      visibly exposes a grow name or selector.
3. Set the GitHub Actions variables:
   - `E2E_FIXTURE_MODE=true`
   - `E2E_FIXTURE_EXPECTED_TENT_NAME=E2E Test Tent`
   - `E2E_FIXTURE_EXPECTED_PLANT_NAME=E2E Test Plant`
   - Optional: `E2E_FIXTURE_EXPECTED_GROW_NAME=E2E Test Grow`
4. Point `E2E_GROW_1_PLANT_URL` at that account's E2E Test Plant page on
   `https://verdantgrowdiary.com` — **never** at a customer's grow or a grow
   another account owns.

Fixture verification will hard-fail if:

- `E2E_FIXTURE_MODE` is not exactly `"true"`.
- `E2E_FIXTURE_EXPECTED_TENT_NAME` or `E2E_FIXTURE_EXPECTED_PLANT_NAME`
  is blank or does not look like an E2E/Test name.
- `E2E_FIXTURE_EXPECTED_GROW_NAME` is supplied but does not look like
  an E2E/Test name. (A missing grow name is allowed.)
- `E2E_GROW_1_PLANT_URL` is not `https://verdantgrowdiary.com/plants/<UUID>`
  (optionally with matching `tentId` / `growId` UUIDs).
- The signed-in server identity is not `cheekhimself@gmail.com`, or the
  app's own reads do not show that account owning the active plant, its tent
  and its grow. Visible names alone never authorize a save.
- Any of those reads is missing, failed, empty, contradictory or still in
  flight.
- The opened page does not contain `E2E` / `Test` markers or the
  expected tent/plant names. A missing grow name on the page is
  allowed unless `E2E_FIXTURE_EXPECTED_GROW_NAME` is supplied.

The fixture validator:

- never deletes data
- never overwrites grow/tent/plant names
- never uses `service_role`
- never bypasses auth (relies on the normal storageState produced by
  `auth.setup.ts`)

The smoke writes real diary entries into the E2E fixture, each tagged
`[smoke <ISO timestamp>]`. No automatic cleanup is performed; periodically prune the E2E Test Plant's diary
manually if desired. There is no scheduled or nightly smoke trigger.

An **optional** UI-only bootstrap is available behind an explicit
opt-in flag (`E2E_ALLOW_FIXTURE_BOOTSTRAP=true`). It is **off by
default**, never deletes/renames/overwrites data, never uses
`service_role`, and refuses to "force" creation when stable selectors
are missing. Bootstrap keeps its production-host refusal, so it cannot run
in the production smoke lane; leave it off. Bootstrap remains **deferred** for general use — see the
full checklist in [`e2e/FIXTURE_SETUP.md`](./FIXTURE_SETUP.md) and the
"Rotate or recreate the disposable E2E account" section below.

> For the end-to-end fixture setup, screenshot guidance, and account
> rotation steps, see [`e2e/FIXTURE_SETUP.md`](./FIXTURE_SETUP.md).

### Garden rotation CLI

Prune **E2E-prefixed pheno hunts** on a clean fixture account (dry-run by default):

```bash
export E2E_ROTATION_TARGET_PROJECT_REF=<supabase-project-ref>  # required pin
bun run e2e:fixture:rotate:dry
bun run e2e:fixture:rotate              # hunts + auto-seed tent/plant
bun run e2e:fixture:rotate:with-diary   # also E2E diary notes on fixture plants
```

Requires fixture user JWT, Supabase URL/anon, and **project pin**. Contaminated
accounts (real grows) are **blocked**. CI: workflow_dispatch only
(`e2e-fixture-garden-rotation.yml`). See `docs/cleanup/e2e-test-data-management.md` §8.

## Rotate or recreate the disposable E2E account

There are **no hardcoded credentials** in this repository. The test
account's email and password live only in
`secrets.E2E_TEST_EMAIL` and `secrets.E2E_TEST_PASSWORD`.

The production smoke lane accepts only `cheekhimself@gmail.com`
(`e2e/lib/productionQuickLogFixtureRules.ts`). Changing that account's
password needs only the secret update. Switching to a different account needs
a reviewed policy change first; until then the fixture guard refuses it.

To rotate the disposable test account safely:

1. Create a **new** dedicated test account through the normal `/auth`
   UI. Do not use a personal or production grower account.
2. Create **only** the expected E2E fixture data on the new account,
   manually (see `e2e/FIXTURE_SETUP.md`; bootstrap is unavailable for the
   production lane).
3. Update GitHub Actions **secrets**:
   - `E2E_TEST_EMAIL`
   - `E2E_TEST_PASSWORD`
4. Update GitHub Actions **variables**:
   - `E2E_GROW_1_PLANT_URL` (new plant URL on the new account)
   - `E2E_FIXTURE_MODE=true`
   - expected grow/tent/plant names
   - optional `E2E_FIXTURE_EXPECTED_ACCOUNT_HINT` (if set, exactly
     `cheekhimself@gmail.com`; **never** a password or token)
5. Trigger the workflow manually via `workflow_dispatch`.
6. Confirm the `Verify disposable E2E fixture` step passes **before**
   the smoke writes occur.
7. Deactivate or stop using the old test account externally. Do
   **not** add in-app deletion automation.

Run `bun run e2e:fixture-checklist` locally to print the required
variable/secret names and the manual setup checklist. The script
never reads or prints any secret value, never calls Supabase or
admin APIs, and never creates or deletes data.

## Optional UI-only bootstrap

> **Unavailable for the production Quick Log smoke lane.** The bootstrap keeps
> the generic fixture guard, which refuses `verdantgrowdiary.com`. With
> `E2E_ALLOW_FIXTURE_BOOTSTRAP=true` and the production plant URL, the
> workflow's `Bootstrap disposable E2E fixture` step fails before fixture
> verification. Leave `E2E_ALLOW_FIXTURE_BOOTSTRAP` unset for this lane and
> create the fixture manually.

The bootstrap spec (`e2e/fixture-bootstrap.spec.ts`) is **off by
default**. It runs only when:

- `E2E_FIXTURE_MODE=true`, **and**
- `E2E_ALLOW_FIXTURE_BOOTSTRAP=true`

Behavior:

- Signs in via the normal storageState — no auth bypass, no
  `service_role`.
- If the exact E2E grow/tent/plant names are already present, makes
  **no UI changes** (idempotent no-op).
- If selectors are not stable, returns **blocked** with the exact
  `data-testid` selectors required. It will never "force" creation.
- Never deletes, renames, or modifies existing grows/tents/plants.
- Never creates non-E2E names.

Local:

```bash
bun run e2e:bootstrap-fixture
```

CI: a `Bootstrap disposable E2E fixture` step runs only when
`vars.E2E_ALLOW_FIXTURE_BOOTSTRAP == 'true'`. Fixture verification
still runs afterwards; smoke is still gated on verification success.
The run summary reports bootstrap status as one of `not enabled`,
`passed`, `failed`, or `skipped`.

## Media artifacts (.png/.jpg/.jpeg/.gif/.webm/.mp4)

The `quicklog-playwright-media` artifact bundles screenshots and
videos captured by Playwright. Patterns:

- `test-results/**/*.png`
- `test-results/**/*.jpg`
- `test-results/**/*.jpeg`
- `test-results/**/*.gif`
- `test-results/**/*.webm`
- `test-results/**/*.mp4`
- `playwright-report/data/**`

GitHub artifacts are **downloads, not hosted HTML pages** — download
the artifact and open files locally. The run summary links to each
dedicated artifact via the upload action's `artifact-url` output
(with a fallback to the run's `#artifacts` section); no invented
direct raw URLs are produced.

## Local setup

Install Playwright once (it is declared in `devDependencies`, so
`bun install` already pulled it; the browser binaries are separate):

```bash
bun run e2e:install
```

### Optional TestDino live streaming

`playwright.config.ts` keeps the existing `list` / `html` / `json` reporters
and adds `@testdino/playwright` only when `TESTDINO_TOKEN` is set. The token
must come from the environment — never commit a real key. There is no
separate upload step; results stream as tests finish.

```bash
export TESTDINO_TOKEN="<project-api-key>"
bunx playwright test --project=chromium-mocked e2e/legal-seo-metadata.spec.ts
# If bunx is not on PATH, the same command is:
npx playwright test --project=chromium-mocked e2e/legal-seo-metadata.spec.ts
```

Existing project scripts (`bun run e2e:quicklog-smoke`, `bun run e2e:ga`,
etc.) work the same way: export `TESTDINO_TOKEN` first, then run as usual.
CI should leave the variable unset until a secret is deliberately added;
an empty or missing token does not fail the Playwright run.

### Local dev server

The Quick Log smoke and `e2e:verify-fixture` run against production only, so a
local dev server cannot satisfy their fixture guard. Run them from your machine
with "Run the Quick Log smoke locally" below. To exercise UI against a local dev
server, use the credential-free `chromium-mocked` project with an explicit spec
filter; that project installs no global route mocks, so an unfiltered run can
reach real Supabase.

```bash
bun run dev -- --host 127.0.0.1 --port 8080 &
E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked e2e/<spec>.spec.ts
```

### Debug / headed run

```bash
bun run e2e:quicklog-smoke:headed
bun run e2e:report           # open last HTML report
```

## Run the Quick Log smoke locally

Exact reproduction steps for the same smoke that runs in CI. It runs from
your machine against production, `https://verdantgrowdiary.com`, as the
approved smoke account. There is no non-production smoke host
([`docs/production-only-verification-runbook.md`](../docs/production-only-verification-runbook.md)).

Prerequisites:

- A real checkout of `Verdant-OS/verdant-grow-diary`.
- [Bun](https://bun.sh) installed.
- Dependencies installed (`bun install`).
- Playwright Chromium installed (`bun run e2e:install`).
- The E2E Test Plant URL on `https://verdantgrowdiary.com`, owned by the
  smoke account.
- The approved dedicated **test account**, `cheekhimself@gmail.com`
  (email + password). Never use `matt@verdantgrowdiary.com`, the KEEP account
  or a customer's credentials — the smoke creates real diary entries.

Replace `YOUR_TEST_PLANT_UUID` below with the E2E Test Plant's UUID.

- Use `https://verdantgrowdiary.com` for both `E2E_BASE_URL` and
  `E2E_GROW_1_PLANT_URL`. The signed-in session is stored per origin.
- The fixture guard (`e2e/lib/fixtureSafety.ts` with
  `e2e/lib/productionQuickLogFixtureRules.ts`) refuses any other app origin,
  any backend other than the committed public Supabase origin, and any account
  other than `cheekhimself@gmail.com`. A local dev server or another host is
  refused before any write.
- If identity, ownership or tagging cannot be verified, stop and report the
  exact gap. Do not point the smoke at another host instead.
- The old published host `verdantgrowdiary-com.lovable.app` no longer serves
  the app: it answers HTTP 404 "No Lovable project found at this address".
  If `E2E_BASE_URL` points at a host like that, `bun run e2e:setup` stops at
  once with an error that names it.

### Windows PowerShell

```powershell
bun install
bun run e2e:install

$env:E2E_BASE_URL="https://verdantgrowdiary.com"
$env:E2E_GROW_1_PLANT_URL="https://verdantgrowdiary.com/plants/YOUR_TEST_PLANT_UUID"
$env:E2E_FIXTURE_MODE="true"
$env:E2E_FIXTURE_EXPECTED_TENT_NAME="E2E Test Tent"
$env:E2E_FIXTURE_EXPECTED_PLANT_NAME="E2E Test Plant"
$env:E2E_GROW_1_SECOND_PLANT_NAME="E2E Test Plant 2"
$env:E2E_TEST_EMAIL="cheekhimself@gmail.com"
$env:E2E_TEST_PASSWORD="your-test-password"

bun run e2e:setup
bun run e2e:quicklog-smoke
```

### Bash / macOS / Linux

```bash
bun install
bun run e2e:install

export E2E_BASE_URL="https://verdantgrowdiary.com"
export E2E_GROW_1_PLANT_URL="https://verdantgrowdiary.com/plants/YOUR_TEST_PLANT_UUID"
export E2E_FIXTURE_MODE="true"
export E2E_FIXTURE_EXPECTED_TENT_NAME="E2E Test Tent"
export E2E_FIXTURE_EXPECTED_PLANT_NAME="E2E Test Plant"
export E2E_GROW_1_SECOND_PLANT_NAME="E2E Test Plant 2"
export E2E_TEST_EMAIL="cheekhimself@gmail.com"
export E2E_TEST_PASSWORD="your-test-password"

bun run e2e:setup
bun run e2e:quicklog-smoke
```

The smoke command itself internally runs the same read-only fixture validation
immediately after navigation and before re-consent or any Quick Log
write-producing action. Tent + Plant fixture names are required; Grow is optional.
The validation checks the signed-in account, the owned plant, tent and grow,
and the configured fixture names, and fails before writes on any mismatch.

### Debugging a local failure

- `bun run e2e:quicklog-smoke:headed` — run with a visible browser.
- `bun run e2e:report` — open the last HTML report.
- Inspect `e2e/results/quicklog-smoke-report.txt` first — that is the
  first file to open when triaging any smoke failure. Then open the
  matching trace/screenshots/video under `playwright-report/` and
  `test-results/`.

Reminders:

- `e2e/.auth/user.json` is generated locally and **must not be committed**.
- The smoke creates real test diary entries. Use only a dedicated
  **test plant** and **test account**, never a real grower's data.

## storageState lifecycle

`e2e/.auth/user.json` is created by `bun run e2e:setup`, which drives the
real `/auth` UI with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`. It is:

- Gitignored. Never commit it.
- Reused by subsequent runs as long as the session stays valid.
- Should be refreshed whenever:
  - login expires
  - password changes
  - Supabase session expires
  - the smoke starts redirecting to `/auth`

To regenerate:

```bash
rm -f e2e/.auth/user.json    # PowerShell: Remove-Item e2e/.auth/user.json
bun run e2e:setup
```

If neither a valid storageState nor email/password is available, the setup
project skips with a clear message. There is no fallback that bypasses auth.

## Smoke report artifact

Every run writes a stable report regardless of pass/fail:

- `e2e/results/quicklog-smoke-report.json`
- `e2e/results/quicklog-smoke-report.txt`

On failure the test log prints:

```
FAILED step <n>: <label>
  evidence: <message>
  report: e2e/results/quicklog-smoke-report.json
```

Playwright also attaches the JSON copy to its per-test artifact bundle.

## CI workflow

Workflow: `.github/workflows/quicklog-smoke.yml`

Triggers:

- `workflow_dispatch` — manual run from branch `verdant-grow-diary`. Fails fast
  with a clear message if any required secret/var is missing:
  ```
  Missing required Quick Log smoke configuration. Configure Actions vars/secrets.
  ```
- `push` to `verdant-grow-diary` touching `e2e/**`, `playwright.config.ts`, or the
  workflow itself — runs the same job, but skips cleanly if secrets are
  unavailable so forked-repo pushes never leak or fail mysteriously:
  ```
  Skipping Quick Log smoke: E2E vars/secrets are unavailable for this event.
  ```
- `pull_request` to `verdant-grow-diary` (safe `pull_request` event, never
  `pull_request_target`) — PRs without access to E2E vars/secrets
  (e.g. forked PRs) skip cleanly with the message
  ```
  Skipping Quick Log smoke: E2E vars/secrets are unavailable for this PR context.
  ```
  and the job completes successfully.

## CI handoff: Quick Log smoke

- Secrets:
  - `E2E_TEST_EMAIL`
  - `E2E_TEST_PASSWORD`
- Variables:
  - `E2E_BASE_URL`
  - `E2E_GROW_1_PLANT_URL`
- Optional variable:
  - `E2E_GROW_1_SECOND_PLANT_NAME` (defaults to `"E2E Test Plant 2"`; same grow/tent)

Artifacts (uploaded with `if: always()` under the name
`quicklog-smoke-artifacts`, retained for 30 days):

### Required GitHub Actions Secrets

- `E2E_TEST_EMAIL` — login email for the dedicated smoke test account
- `E2E_TEST_PASSWORD` — login password for the dedicated smoke test account

### Workflow

File: `.github/workflows/quicklog-smoke.yml`

- Manual run: **Actions → Quick Log Playwright smoke → Run workflow**
- Pull request run: runs automatically on PRs targeting `verdant-grow-diary`,
  and skips cleanly if required secrets/vars are unavailable (e.g. forked PRs).

Branch note: Lovable currently syncs to `verdant-grow-diary`, so the Quick Log
smoke workflow targets that branch for `push` and `pull_request` events. If the
protected branch changes later, update the workflow and this README together.

### Artifact

- Name: `quicklog-smoke-artifacts`
- Retention: **30 days**
- Uploaded with `if: always()` so failures still produce a report.
- Expected paths:
  - `e2e/results/quicklog-smoke-report.json`
  - `e2e/results/quicklog-smoke-report.txt`
  - `playwright-report/`
  - `test-results/`

`e2e/.auth/user.json` is gitignored and is **never** uploaded as part of
the artifact bundle.

### Failure triage

1. Open `e2e/results/quicklog-smoke-report.txt` first — it lists the
   failed step number, label, and evidence.
2. Inspect the Playwright HTML report under `playwright-report/`, plus
   traces, screenshots, and videos under `test-results/`.
3. Paste the `.txt` report back into the project thread for diagnosis.

### Safety note

- The smoke creates real Quick Log diary entries through the normal
  authenticated UI.
- Use a dedicated test account and a dedicated test plant.
- Do not run against a real grower account.
- Do not commit `e2e/.auth/user.json`.
- Do not use service role keys.
- Do not add auth bypasses.

Find artifacts under the workflow run summary → Artifacts.

Find them under the workflow run summary → Artifacts.

## Run summary, smoke metadata, and caches

The workflow writes a markdown summary to `$GITHUB_STEP_SUMMARY` (rendered
at the top of every run page). It includes:

- A `[Workflow run](...)` link to the current run page.
- An `[Artifacts](...#artifacts)` link that jumps to the run's Artifacts
  section (`quicklog-smoke-artifacts` is downloaded from there).
- The exact smoke command: `bun run e2e:quicklog-smoke`.
- Browser: `chromium`.
- Playwright version, captured via `bunx playwright --version` (falls back
  to `unavailable` if it cannot be read).
- Smoke counts (`total` / `passed` / `failed` / `skipped`) parsed
  best-effort from `e2e/results/quicklog-smoke-report.json` when present.
  When the report JSON is absent the summary prints:
  `Smoke counts unavailable: report JSON was not produced.`
  Count parsing never masks a real Playwright failure, and the existing
  artifact-guard step still fails the job when the report JSON or
  `playwright-report/` is missing after a real smoke attempt.

The workflow uses best-effort GitHub Actions caches to speed up runs:

- Bun package cache: `~/.bun/install/cache`
- Playwright browser cache: `~/.cache/ms-playwright`

Cache keys are scoped by `runner.os` and a hash of `bun.lock` / `bun.lockb`
/ `package.json`. `bun install --frozen-lockfile` and
`bun run e2e:install:ci` always run after restore, so Chromium and OS
deps are still verified on every run.

Caches intentionally never include:

- `e2e/.auth` (storageState — generated locally, gitignored)
- `e2e/results` (smoke reports)
- `test-results` (Playwright traces, screenshots, videos)
- `playwright-report` (Playwright HTML report)
- Any secret, Supabase session, or Supabase access/refresh token.

Cache key guardrails:

- Every `actions/cache@v4` step is gated by
  `steps.e2e_config.outputs.should_run == 'true'`.
- Every cache `key:` includes `${{ runner.os }}` plus
  `hashFiles('bun.lock', 'bun.lockb', 'package.json')` so a lockfile or
  `package.json` change always busts the cache.
- `restore-keys:` includes the `${{ runner.os }}-` prefix only.
- Cache `path:` values are restricted to `~/.bun/install/cache` and
  `~/.cache/ms-playwright`. Auth state (`e2e/.auth`, `storageState`,
  `user.json`), smoke reports (`e2e/results`), Playwright outputs
  (`test-results`, `playwright-report`), and any `secrets.*` reference
  (including `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`,
  `SUPABASE_SERVICE_ROLE`, `service_role`) are never cached.

### Failure annotation

The summary includes a `### Failure annotation` block that distinguishes:

- **Smoke command failure** — the `quicklog_smoke` step outcome /
  conclusion is `failure`. Inspect `quicklog-smoke-report.txt`,
  Playwright trace, screenshots, and videos.
- **Report JSON missing** — smoke ran but
  `e2e/results/quicklog-smoke-report.json` was not produced. The
  artifact guard fails this job after a real smoke attempt.
- **Report parsing failed** — report JSON exists but smoke counts could
  not be extracted. This is a metadata problem, not the same as a
  Playwright smoke failure. The metadata step still exits 0 so it
  cannot mask the real Playwright failure.
- **Report parsing succeeded** — smoke counts were extracted from
  `quicklog-smoke-report.json`.

The metadata step emits `report_json_present` and `report_parse_status`
outputs and may also emit `::warning::` annotations for the missing /
failed cases. The job summary is the source of truth.

### Summary links and Playwright report artifact

The summary links to:

- The workflow run (`[Workflow run]`).
- The run's Artifacts section (`[Artifacts]` → `#artifacts`).
- The bundled `quicklog-smoke-artifacts` artifact.
- A dedicated `quicklog-playwright-report` artifact (Playwright HTML
  report only), via
  `steps.upload_playwright_report.outputs.artifact-url`.
- A dedicated `quicklog-playwright-traces` artifact (Playwright trace
  zips from `test-results/**/*.zip`).
- A dedicated `quicklog-playwright-media` artifact (screenshots / videos
  from `test-results/**/*.{png,webm,mp4}` and `playwright-report/data/**`).
- A dedicated `quicklog-smoke-report-json` artifact
  (`e2e/results/quicklog-smoke-report.json`).
- A dedicated `quicklog-smoke-report-txt` artifact
  (`e2e/results/quicklog-smoke-report.txt`).

If any per-artifact URL is unavailable the link falls back to the run's
`#artifacts` section. No direct file URLs inside a zipped artifact are
invented and no run/artifact IDs are hardcoded.

GitHub artifacts are downloads, not hosted HTML pages — download the
artifact and open `index.html` (HTML report) or the report files
locally. For JSON/TXT report artifacts, download and open the file
directly.

There is no scheduled or nightly Quick Log smoke. Write-producing smoke
must only run against a disposable test account/test plant, so the
workflow stays manual-dispatch / PR / push only until such a fixture
exists. See the real-write warning at the top of this file.

## Run from GitHub Actions manually

Exact steps to dispatch the Quick Log smoke from GitHub:

1. Open the repository: <https://github.com/Verdant-OS/verdant-grow-diary>.
2. Click the **Actions** tab.
3. In the left sidebar, select **Quick Log Playwright smoke**.
4. Click **Run workflow**.
5. Select branch **`verdant-grow-diary`**.
6. Click **Run workflow** to dispatch.
7. Open the new run and watch the **run summary** at the top of the run page.
8. After completion, scroll to **Artifacts** on the run page and download
   `quicklog-smoke-artifacts`.

Required repository configuration before dispatching:

- Variables (Settings → Secrets and variables → Actions → Variables):
  - `E2E_BASE_URL`
  - `E2E_GROW_1_PLANT_URL`
  - `E2E_GROW_1_SECOND_PLANT_NAME` (optional; defaults to `"E2E Test Plant 2"`)
- Secrets (Settings → Secrets and variables → Actions → Secrets):
  - `E2E_TEST_EMAIL`
  - `E2E_TEST_PASSWORD`

Expected behavior:

- If any required config is missing during `workflow_dispatch`, the workflow
  **fails fast** in the `Verify required configuration` step with the
  message:
  ```
  Missing required Quick Log smoke configuration. Configure Actions vars/secrets.
  ```
- If config is present, the workflow installs Bun, installs Playwright
  Chromium with OS deps, runs `bun run e2e:quicklog-smoke`, writes the
  smoke reports, verifies required report artifacts exist, and uploads
  the `quicklog-smoke-artifacts` bundle.

Where outputs appear:

- **GitHub run summary** — at the top of the workflow run page, written
  via `$GITHUB_STEP_SUMMARY`. Includes whether the smoke executed or was
  skipped, and (on skip) the names of the missing config keys.
- **Artifacts** — workflow run page → **Artifacts** →
  `quicklog-smoke-artifacts`. Expected paths inside:
  - `e2e/results/quicklog-smoke-report.json`
  - `e2e/results/quicklog-smoke-report.txt`
  - `playwright-report/`
  - `test-results/`

**First file to inspect on any failure:**
`e2e/results/quicklog-smoke-report.txt`.

## Troubleshooting Quick Log smoke failures

Start with `quicklog-smoke-report.txt` (or the JSON sibling). Find the first
line marked `✗` — that step number, label, and evidence point at the
failure. Then open the Playwright trace, screenshots, and video for the
same step inside `playwright-report/` / `test-results/`.

Common failure cases:

- **Missing GitHub variable or secret**
  - Report / check: workflow precheck logs (`Verify required configuration`).
  - Fix: add the missing repo Actions vars/secrets
    (`E2E_BASE_URL`, `E2E_GROW_1_PLANT_URL`, `E2E_TEST_EMAIL`,
    `E2E_TEST_PASSWORD`). On PRs without access these will skip cleanly.

- **Redirected to `/auth`**
  - Likely: expired/missing storageState or bad test credentials.
  - Fix locally: refresh `e2e/.auth/user.json` by removing it and re-running
    `bun run e2e:setup`. In CI: verify `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
    still log in via the real `/auth` UI.

- **Cannot find Grow #1 plant page**
  - Likely: bad `E2E_GROW_1_PLANT_URL`, the test user lacks access, or the
    plant route changed.
  - Fix: open the URL as the test user in a browser and update the var.

- **Cannot find same-grow second target plant**
  - Likely: `E2E_GROW_1_SECOND_PLANT_NAME` does not match a second plant in
    the route plant's current grow/tent, or the test fixture is missing.
  - Fix: update the var or create/rename the test plant for the test
    account.

- **Stale snapshot helper missing**
  - Likely: no stale/non-usable snapshot exists in the current fixture,
    helper copy changed, or the selector moved.
  - Fix: inspect the failing report step, screenshots, and the current
    sensor state for the target plant.

- **Watering validation focus failed**
  - Likely: the Watering (ml) field copy/selector or focus restoration
    behavior changed.
  - Fix: inspect the failing step in the report and open the Playwright
    trace for that step.

- **Report says a later step failed after save**
  - Likely: save succeeded but post-save UI changed (View {plant} /
    Log another for {plant} / Close).
  - Fix: inspect the `View {plant}` and `Log another for {plant}` steps and
    confirm the post-save route target.

How to read the report:

1. Open `quicklog-smoke-report.txt`.
2. Find the first `✗` line — that is the first failure.
3. Use the step number + label + evidence to locate the matching test
   action.
4. Open the Playwright trace / screenshots / video for that same step in
   `playwright-report/` and `test-results/`.

Reminder:

- The smoke creates real diary entries against the configured account.
- Always use a dedicated test account and test plant. Never point the
  smoke at a real grower's data.

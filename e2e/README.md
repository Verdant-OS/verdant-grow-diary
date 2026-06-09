# Verdant Grow OS — Authenticated Playwright Smoke

Playwright is the source of truth for browser-level Quick Log keyboard,
focus, and post-save flows. Vitest covers deterministic component logic in
jsdom but cannot prove real Tab order or focus restoration.

## Safety guarantees

- No app-level auth bypass.
- No hardcoded credentials in the repo.
- No `service_role` or bridge tokens in browser context.
- No localStorage token injection (unless produced by a real Playwright login).
- No fake live sensor data; stale/non-usable snapshots are never attached.
- No Action Queue / device-control writes.
- `e2e/.auth/user.json` is generated locally and is gitignored. Never commit it.
- `e2e/results/` is gitignored. Never commit it.

## Required env

| Name                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `E2E_BASE_URL`          | Base URL of the running app (e.g. http://localhost:5173) |
| `E2E_GROW_1_PLANT_URL`  | Full URL of a Grow #1 plant page to open first       |
| `E2E_TEST_EMAIL`        | Login email for the smoke account                    |
| `E2E_TEST_PASSWORD`     | Login password for the smoke account                 |
| `E2E_GROW_2_PLANT_NAME` | Optional. Defaults to `505 Headbanger`               |

`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are only required to (re)generate
`e2e/.auth/user.json`. Once that file exists, the smoke run reuses it.

## Local setup

Install Playwright once (it is declared in `devDependencies`, so
`bun install` already pulled it; the browser binaries are separate):

```bash
bun run e2e:install
```

### Bash / macOS / Linux

```bash
export E2E_BASE_URL="http://localhost:5173"
export E2E_GROW_1_PLANT_URL="http://localhost:5173/plants/<grow1-plant-id>"
export E2E_TEST_EMAIL="you+e2e@example.com"
export E2E_TEST_PASSWORD="••••••••"

bun run dev &           # serve the app on E2E_BASE_URL
bun run e2e:setup       # writes e2e/.auth/user.json
bun run e2e:quicklog-smoke
```

### Windows PowerShell

```powershell
$env:E2E_BASE_URL          = "http://localhost:5173"
$env:E2E_GROW_1_PLANT_URL  = "http://localhost:5173/plants/<grow1-plant-id>"
$env:E2E_TEST_EMAIL        = "you+e2e@example.com"
$env:E2E_TEST_PASSWORD     = "********"

bun run dev               # in another terminal
bun run e2e:setup
bun run e2e:quicklog-smoke
```

### Debug / headed run

```bash
bun run e2e:quicklog-smoke:headed
bun run e2e:report           # open last HTML report
```

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

- `workflow_dispatch` — manual run. Fails fast with a clear message if any
  required secret/var is missing.
- `push` to `main` touching `e2e/**`, `playwright.config.ts`, or the
  workflow itself — runs the same job, but skips cleanly if secrets are
  unavailable so forked-repo pushes never leak or fail mysteriously.
- `pull_request` targeting `main` — runs on every PR into `main`. Uses
  the safe `pull_request` event (never `pull_request_target`), so forked-PR
  runs cannot read repository secrets. When secrets/vars are unavailable
  (which is the default for forked PRs), the workflow skips cleanly with
  a non-secret message rather than failing or leaking configuration.

## CI handoff: Quick Log smoke

### Required GitHub Actions Variables

- `E2E_BASE_URL` — base URL of the running app under test
- `E2E_GROW_1_PLANT_URL` — full URL of a Grow #1 plant page
- `E2E_GROW_2_PLANT_NAME` — optional, defaults to `505 Headbanger`

### Required GitHub Actions Secrets

- `E2E_TEST_EMAIL` — login email for the dedicated smoke test account
- `E2E_TEST_PASSWORD` — login password for the dedicated smoke test account

### Workflow

File: `.github/workflows/quicklog-smoke.yml`

- Manual run: **Actions → Quick Log Playwright smoke → Run workflow**
- Pull request run: runs automatically on PRs targeting `main`, and skips
  cleanly if required secrets/vars are unavailable (e.g. forked PRs).

Branch note: PR smoke is configured for `main` per request. If the repo's
default branch is still `verdant-grow-diary`, this workflow still targets
`main` for PR/push triggers; the default branch is not renamed here.

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


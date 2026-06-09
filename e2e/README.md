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

Because of this:

- **Do not point `E2E_GROW_1_PLANT_URL` at a real active grow.** Pointing
  the smoke at a production grow will pollute that grow's diary with test
  entries that the app does not roll back.
- **Use only a dedicated test account and a dedicated test plant.** The
  account must own the test plant and must not own real grower data you
  care about.
- **Until a disposable test fixture exists, run the workflow manually
  only.** There is intentionally no scheduled/nightly trigger — automated
  scheduled smoke against a real grow is unsafe and is not enabled.
- No automatic data cleanup, deletion, or mutation of existing grow data
  happens outside the intentional Quick Log save flow itself.

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

## Run the Quick Log smoke locally

Exact reproduction steps for the same smoke that runs in CI.

Prerequisites:

- A real checkout of `Verdant-OS/verdant-grow-diary`.
- [Bun](https://bun.sh) installed.
- Dependencies installed (`bun install`).
- Playwright Chromium installed (`bun run e2e:install`).
- A reachable app URL (production preview or a local `bun run dev`).
- A test plant URL on Grow #1 you control via the test account.
- A dedicated **test account** (email + password). Never use production
  grower credentials — the smoke creates real diary entries.

### Windows PowerShell

```powershell
bun install
bun run e2e:install

$env:E2E_BASE_URL="https://verdantgrowdiary-com.lovable.app"
$env:E2E_GROW_1_PLANT_URL="https://verdantgrowdiary-com.lovable.app/plants/YOUR_TEST_PLANT_ID"
$env:E2E_GROW_2_PLANT_NAME="505 Headbanger"
$env:E2E_TEST_EMAIL="your-test-email"
$env:E2E_TEST_PASSWORD="your-test-password"

bun run e2e:setup
bun run e2e:quicklog-smoke
```

### Bash / macOS / Linux

```bash
bun install
bun run e2e:install

export E2E_BASE_URL="https://verdantgrowdiary-com.lovable.app"
export E2E_GROW_1_PLANT_URL="https://verdantgrowdiary-com.lovable.app/plants/YOUR_TEST_PLANT_ID"
export E2E_GROW_2_PLANT_NAME="505 Headbanger"
export E2E_TEST_EMAIL="your-test-email"
export E2E_TEST_PASSWORD="your-test-password"

bun run e2e:setup
bun run e2e:quicklog-smoke
```

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
  **test plant** and **test account**, never production grower data.

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

Required GitHub configuration:

- Secrets:
  - `E2E_TEST_EMAIL`
  - `E2E_TEST_PASSWORD`
- Variables:
  - `E2E_BASE_URL`
  - `E2E_GROW_1_PLANT_URL`
- Optional variable:
  - `E2E_GROW_2_PLANT_NAME` (defaults to `"505 Headbanger"`)

Artifacts (uploaded with `if: always()` under the name
`quicklog-smoke-artifacts`, retained for 30 days):

- `e2e/results/quicklog-smoke-report.json`
- `e2e/results/quicklog-smoke-report.txt`
- `playwright-report/`
- `test-results/`

Find them under the workflow run summary → Artifacts.

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
  - `E2E_GROW_2_PLANT_NAME` (optional; defaults to `"505 Headbanger"`)
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

- **Cannot find Grow #2 / target plant**
  - Likely: `E2E_GROW_2_PLANT_NAME` does not match an existing plant, or
    the test fixture is missing.
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
  smoke at production grower data.

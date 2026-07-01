# Pheno Comparison — Playwright quickstart

Run the read-only **Pheno Comparison** Playwright specs locally, using the
exact same mocked configuration as CI (`.github/workflows/pheno-comparison-v0.yml`).

These specs exercise `/pheno-comparison` and `/pheno-hunts/:id/compare`, which
are **fixture-only, read-only** routes mounted outside AppShell. They require
**no login, no credentials, and no saved auth state** — all Supabase traffic is
either absent or intercepted, so the specs run against the local dev server with
only the committed public client config.

## Prerequisites

- [Bun](https://bun.sh) (repo standard) — `bun --version`
- Node.js (for the underlying Playwright runtime)
- Dependencies installed: `bun install`

## 1. Install the browser (Chromium only)

```bash
bun run e2e:install          # playwright install chromium
# CI equivalent (also installs OS deps on Linux):
# bun run e2e:install:ci     # playwright install --with-deps chromium
```

## 2. Run the pheno specs

```bash
bun run test:pheno-playwright
```

This runs, on the `chromium-mocked` project (no auth setup, no storageState):

- `e2e/pheno-comparison-responsive.spec.ts`
- `e2e/pheno-comparison-reload.spec.ts`
- `e2e/pheno-comparison-visual-style.spec.ts`
- `e2e/pheno-hunts-compare-deep-link.spec.ts`
- `e2e/pheno-hunts-compare-invalid-id.spec.ts`

Playwright auto-starts the app for you: `playwright.config.ts` `webServer` runs
`bunx vite --port 5173 --strictPort` and waits for it. You do **not** need to
start Vite yourself.

## 3. Headed / debug mode

```bash
bun run test:pheno-playwright:headed        # watch it run in a real window

# Step through interactively (Playwright Inspector):
PWDEBUG=1 bun run test:pheno-playwright
# or target one spec:
bunx playwright test --project=chromium-mocked --debug \
  e2e/pheno-comparison-visual-style.spec.ts
```

## 4. Where artifacts land

| Artifact                              | Location                                              | When                                                                   |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Visual-style review screenshots       | `e2e/screenshots/pheno-comparison-visual-style-*.png` | every run (artifact only — no pixel gating)                            |
| Traces / videos / failure screenshots | `test-results/`                                       | **on failure** (config: `trace`/`video`/`screenshot` = `*-on-failure`) |
| HTML report                           | `playwright-report/`                                  | when run with `--reporter=list,html` (CI does this)                    |

Open the last HTML report:

```bash
bun run e2e:report          # playwright show-report
```

In CI, when a pheno spec fails, these are uploaded as the
`pheno-playwright-artifacts` artifact (14-day retention). Green runs upload
nothing.

## 5. If the browser runtime is missing

Symptom: `browserType.launch: Executable doesn't exist at …chromium-XXXX…`.

```bash
bun run e2e:install         # (re)install the matching Chromium build
```

If you are on an offline or locked-down machine and cannot install browsers,
you cannot run these specs locally — rely on CI, which installs Chromium in the
`Install Playwright browsers (Chromium only)` step. The specs are also
type-agnostic to the browser build; a mismatched cached Chromium is fixed by the
install command above.

## Troubleshooting — port conflicts

The dev server binds `5173` with `--strictPort`, so a conflict fails fast with a
clear "Port 5173 is already in use" error instead of silently using another port.

- Free the port (something else is on 5173):
  - Windows (PowerShell): `Get-NetTCPConnection -LocalPort 5173 | Stop-Process -Id { $_.OwningProcess } -Force`
  - macOS/Linux: `lsof -ti:5173 | xargs kill`
- Or point Playwright at an already-running app and skip the managed server:
  ```bash
  E2E_BASE_URL=http://localhost:5173 bun run test:pheno-playwright
  ```
  When `E2E_BASE_URL` is set, the config does **not** start its own server.

## Safety notes

- No auth credentials or `storageState` are required (the `chromium-mocked`
  project does not use `e2e/.auth/user.json`).
- Routes are fixture-only; specs perform no writes, no Supabase calls, and no
  clicks that mutate data.
- Never commit `.env`, tokens, or `e2e/.auth/` auth state; CI artifact upload is
  scoped to report/results/review-screenshot paths only.

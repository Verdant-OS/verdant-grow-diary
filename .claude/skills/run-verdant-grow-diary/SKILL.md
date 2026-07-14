---
name: run-verdant-grow-diary
description: Run, build, screenshot, or test the verdant-grow-diary Grow OS web app. Use when asked to start the dev server, view or screenshot the app, drive a browser flow, run the Playwright e2e suite, or run the Vitest suite.
---

# run-verdant-grow-diary

Verdant Grow Diary is a **React + Vite + TypeScript SPA** backed by Supabase.
The dev server runs on port **8080**. There is no off-the-shelf `chromium-cli`,
so the agent handle for screenshots and browser navigation is the committed
driver **`.claude/skills/run-verdant-grow-diary/driver.mjs`** (a thin Playwright
wrapper). The repo's mocked **Playwright e2e** suite drives real UI flows without
credentials; **Vitest** is the unit/internals path.

All paths below are relative to the project root. Everything here was run in a
headless Linux container against pre-installed `node_modules`.

---

## Prerequisites

- **bun** and **node** on PATH (both present here). Install bun if absent:
  `curl -fsSL https://bun.sh/install | bash`
- **ripgrep** — some static-scan tests shell out to `rg`. Already installed here
  (`rg --version` → 14.1.0); on a bare runner: `sudo apt-get install -y ripgrep`.
- **Chromium** — the container ships Playwright browsers under
  `/opt/pw-browsers` (`chromium-1194`, `chromium-1228`). Both the driver and
  `bunx playwright test` launch headless out of the box; no manual setup.

> **`node_modules` is pre-provisioned in this environment** — build/dev/test all
> work as-is. A clean `bun install --frozen-lockfile` **fails here** with a
> `403` from the private registry mirror (see Troubleshooting); you do not need
> to reinstall.

---

## Build

```bash
bun run typecheck     # tsc -p tsconfig.app.json --noEmit   → exit 0
bun run build         # vite build                          → "✓ built in ~31s"
```

---

## Run (agent path) — driver.mjs for screenshots / navigation

**1. Start the dev server** (bind IPv4 explicitly — see Gotchas):

```bash
bun run dev -- --host 127.0.0.1 --port 8080
# → VITE ready, Local: http://127.0.0.1:8080/
```

Confirm it is up:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/   # → 200
```

**2. Drive it with the committed driver** (dev server must already be running):

```bash
# node driver.mjs [path] [outfile]
node .claude/skills/run-verdant-grow-diary/driver.mjs / home.png
node .claude/skills/run-verdant-grow-diary/driver.mjs /auth auth.png
```

The driver prints JSON and writes the PNG, e.g.:

```json
{
  "requested": "http://127.0.0.1:8080/",
  "finalUrl": "http://127.0.0.1:8080/auth",
  "httpStatus": 200,
  "title": "Sign in to Verdant Grow Diary",
  "screenshot": "home.png",
  "chromium": "/opt/pw-browsers/chromium-1228/chrome-linux/chrome"
}
```

Unauthenticated `/` client-side-redirects to `/auth` (`finalUrl` shows it): the
rendered page is the sign-in screen — email/password, Sign in / Create account /
Forgot password tabs, "Email me a sign-in link", and a "Payments are in **test
mode** in this preview" banner. Override the origin with `BASE_URL=...`.

## Run (agent path) — mocked Playwright e2e for real UI flows

The `chromium-mocked` project stubs all Supabase traffic with `page.route()`, so
flows run **without credentials**. Point it at the already-running dev server:

```bash
E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked auth-loading
```

Chromium launches, mocked routes intercept, specs execute; failure screenshots/
videos/traces land in `test-results/`. (Observed on `auth-loading`: 3 passed,
4 skipped, 1 failed — a timing-sensitive double-submit assertion. Individual
mocked specs can flake; treat a *new* failure in specs you touched as the signal,
not the absolute count.) Drop the trailing `auth-loading` to run every mocked
spec. Specs needing real login use `--project=chromium-authed` with
`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`/`E2E_BASE_URL`.

## Run (internals path) — Vitest

Most PRs here touch a lib/hook/component; import-and-assert via Vitest is the
fastest handle:

```bash
bunx vitest run src/test/pheno-evidence-receipt-service.test.ts   # → Tests 8 passed
```

## Run (human path) — dev server

```bash
bun run dev            # → http://localhost:8080/  (opens nothing headless)
```

Useless headless on its own; use the driver above to observe it.

---

## Test

```bash
bun run lint           # eslint .
bun run typecheck      # tsc -p tsconfig.app.json --noEmit
bunx vitest run        # full suite — large; runs as parallel shards in CI
```

Targeted sub-suites exist (`bun run test:payments-security`,
`bun run test:sensor-safety`, `bun run test:static-safety`, …) — see
`package.json` scripts.

---

## Gotchas

- **Use `127.0.0.1`, not `localhost`.** Vite binds IPv4; `localhost` can resolve
  to `::1` and the connection hangs. The driver defaults to `http://127.0.0.1:8080`.
- **Port 8080, not 5173.** `vite.config.ts` hardcodes `port: 8080`. When reusing
  a running server for Playwright, set `E2E_BASE_URL=http://127.0.0.1:8080` so it
  doesn't spawn its own server on 5173.
- **`/` redirects to `/auth` when unauthenticated.** The redirect is client-side
  (SPA), so the HTTP status is 200 and only `page.url()` reveals it. Deep links
  like `/dashboard` render the app's own 404/redirect without a session.
- **No local Supabase stack.** The app points at the hosted project; the mocked
  Playwright project intercepts all Supabase traffic so e2e works without
  staging credentials.
- **Root `<title>` vs rendered title.** The static HTML `<title>` is "Verdant
  Grow Diary", but after the SPA boots and redirects, the auth page title is
  "Sign in to Verdant Grow Diary" — assert on the latter for a rendered page.
- **Driver Chromium fallback.** Plain `chromium.launch()` works here, but the
  driver also probes `/opt/pw-browsers` and pins an explicit `executablePath`
  (defensive for containers whose pinned Playwright revision is absent). Override
  with `CHROMIUM=/path/to/chrome`.

---

## Troubleshooting

- **`bun install --frozen-lockfile` → `403` from `*.pkg.dev/lovable-core-prod`.**
  The lockfile pins a private Google Artifact Registry mirror that 403s from this
  sandbox (hit firsthand on `playwright-core`, `hono`). `node_modules` is already
  present, so you normally skip install entirely. If you must reinstall, override
  to the public registry for the run:
  ```bash
  printf 'registry=https://registry.npmjs.org/\n' > .npmrc.tmp
  npm_config_userconfig=$PWD/.npmrc.tmp bun install   # then: rm .npmrc.tmp
  ```
- **Playwright can't find a browser / revision mismatch.** Set
  `CHROMIUM=/opt/pw-browsers/chromium-1228/chrome-linux/chrome` (the driver reads
  it) or `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` for `bunx playwright test`.
- **Driver connects but the screenshot is the sign-in page.** Expected without a
  session — `/` redirects to `/auth`. Use the mocked e2e project (or real creds)
  to reach authenticated screens.

---
name: run-verdant-grow-diary
description: Run, build, screenshot, or test the verdant-grow-diary Grow OS web app. Use when asked to start the dev server, view the app, run Playwright, run the test suite, or take a screenshot.
---

# run-verdant-grow-diary

Verdant Grow Diary is a React + Vite + TypeScript SPA backed by Supabase. It runs on port **8080** (via `bun run dev`). The driver for agents is Playwright (already installed) for headless screenshots and mocked e2e flows. The full Vitest suite is the unit/integration test path.

All paths below are relative to the project root.

---

## Prerequisites

**Critical on Windows: OneDrive reparse points cause `bun install` to fail.** Always work from the local clone:

```
C:\dev\verdant-grow-diary   # Windows only
```

On Linux/CI: clone normally — `bun install --frozen-lockfile` works fine there.

Install bun if absent:
```bash
curl -fsSL https://bun.sh/install | bash
```

Install ripgrep (required by gamification static-scan tests):
```bash
sudo apt-get install -y ripgrep   # Linux/CI only
```

---

## Build

```bash
bun install --frozen-lockfile
bun run build
```

Typecheck only (no emit):
```bash
bun run typecheck
```

---

## Run (agent path) — Playwright headless screenshots

Playwright is installed in the repo. Use it for headless screenshots and mocked flows; no real credentials needed for `chromium-mocked`.

**One-shot screenshot script (no credentials required):**
```javascript
// save as screenshot.mjs, run with: node screenshot.mjs
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'screenshot.png' });
console.log('title:', await page.title()); // "Verdant Grow Diary"
await browser.close();
```

Run with the dev server already up:
```bash
bun run dev &            # starts on port 8080
node screenshot.mjs
```

**Mocked Playwright suite (no credentials — intercepts all Supabase traffic):**
```bash
E2E_BASE_URL=http://localhost:8080 bunx playwright test --project=chromium-mocked
```

Tests in `e2e/` that don't use `auth.setup.ts` run here. They use `page.route()` to stub `/auth/v1/**` and `/rest/v1/**`.

Expected output: ~65 passed, 6 pre-existing failures (`fixture-bootstrap.spec.ts` and `fixture-safety.spec.ts` need real DB credentials; 4 `auth-route-protection-mobile` failures are for routes not yet registered in `App.tsx`). These failures are pre-existing — treat a new failure as a regression.

**Authenticated Playwright suite (needs real credentials):**
```bash
E2E_TEST_EMAIL=you@example.com \
E2E_TEST_PASSWORD=yourpass \
E2E_BASE_URL=http://localhost:8080 \
bunx playwright test --project=chromium-authed
```

Screenshots and traces on failure land in `test-results/`.

---

## Run (human path) — dev server

```bash
bun run dev
# → http://localhost:8080/
```

The app starts in ~400 ms. Root URL redirects unauthenticated users to `/auth`. The auth page shows "Sign in / Create account / Forgot password" tabs backed by Supabase Auth.

---

## Test

```bash
# Lint + typecheck (fast stop-ship gates):
bun run lint && bun run typecheck

# Full Vitest suite (~21 k tests — runs in ~24 min locally):
bunx vitest run

# Key sub-suites:
bun run test:sensor-safety
bun run test:static-safety
bun run test:quicklog-rpc-ownership
bun run test:security-gamification
```

In CI the full suite runs as 36 parallel shards; see `docs/testing/ci-full-suite-shards.md`.

---

## Gotchas

- **OneDrive `bun install` fails** — only on Windows. Use `C:\dev\verdant-grow-diary`, never the OneDrive path.
- **Port 8080, not 5173** — `vite.config.ts` hardcodes port 8080. Playwright's default web-server command uses 5173; set `E2E_BASE_URL=http://localhost:8080` to reuse an already-running dev server.
- **SPA 404s on direct deep links** — `/dashboard` without auth renders the app's own 404 page (client-side redirect). The mocked Playwright tests use `page.route()` to stub auth; navigate to `/auth` first for a reliable unauthed starting point.
- **No local Supabase stack** — the app points to the hosted project (`knkwiiywfkbqznbxwqfh`). The mocked Playwright project intercepts all Supabase traffic so tests work without staging credentials.
- **ripgrep missing on clean Linux** — static-scan tests shell out to `rg`. Install before running the full suite on a fresh runner.
- **Playwright auto-starts a second dev server** — if `E2E_BASE_URL` is unset, Playwright tries to start `bunx vite --port 5173`. If a server is already up on 8080, set the env var to avoid the extra process.

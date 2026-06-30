# Verdant Test Validation Notes

## CI / Linux / VPS-only suites

Some test suites are reliable on CI/Linux/VPS runners with a full Node heap
but can time out in constrained sandboxes (≤300s wall, low fork RAM). Sandbox
timeout for these suites is a capacity issue, **not** a product or test
failure. Do not weaken or skip the suite to make the sandbox pass.

### Ecowitt bridge status page

Suite: `src/test/ecowitt-bridge-status-page.test.tsx`

Run with the exact CI parity command (also exposed as
`bun run test:ecowitt-bridge:ci`):

```bash
NODE_OPTIONS=--max-old-space-size=4096 bunx vitest run \
  src/test/ecowitt-bridge-status-page.test.tsx \
  --reporter=verbose --isolate --pool=forks
```

Rules:

- Sandbox timeouts (≥300s) for this suite are **capacity-related**.
- Validate on CI/Linux/VPS using the command above before claiming a
  regression.
- Do **not** treat a sandbox timeout as a product/test failure unless
  CI/Linux also fails.
- Do **not** raise global Vitest timeouts to mask this — increase only
  scoped to this suite if a real product hang is later confirmed on CI.

## localStorage helper enforcement

Every test file under `src/test/**` must route `localStorage` through
`src/test/helpers/localStorageTestHelper.ts`. CI gates this via:

```bash
node scripts/assert-test-localstorage-helper-usage.mjs
node scripts/test-localstorage-helper-usage-audit.mjs
```

Wired in `.github/workflows/ci.yml` as "Test localStorage helper
enforcement", and exposed as `bun run test:localstorage-helper-enforcement`.

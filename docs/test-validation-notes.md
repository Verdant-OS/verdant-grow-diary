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

## One-click validation commands

Use these exact commands when validating the localStorage / sensor /
ecowitt safety surface. Each block is copy-paste ready and matches what
CI runs.

### 1. localStorage helper enforcement

```bash
bun run test:localstorage-helper-enforcement
```

Equivalent expanded form:

```bash
node scripts/assert-test-localstorage-helper-usage.mjs
node scripts/test-localstorage-helper-usage-audit.mjs
```

### 2. Broader migrated localStorage subset (CI parity)

```bash
NODE_OPTIONS=--max-old-space-size=4096 bunx vitest run \
  src/test/local-storage-helper-setup-order.test.ts \
  src/test/diary-calendar-filter-persistence.test.ts \
  src/test/csv-mapping-preset-storage.test.ts \
  src/test/temperature-unit-preference.test.ts \
  src/test/leads-saved-views.test.ts \
  src/test/onboarding-keyboard.test.tsx \
  src/test/ai-doctor-sessions-saved-views.test.tsx \
  --reporter=verbose \
  --isolate \
  --pool=forks
```

### 3. Sensor safety checks

```bash
node scripts/sensor-safety-check.mjs
node scripts/assert-sensor-intelligence-safety.mjs --quiet
bun run test:docs-demo-safety
```

### 4. Ecowitt bridge CI/Linux validation

```bash
bun run test:ecowitt-bridge:ci
```

Local artifact-capturing variant (writes `artifacts/ecowitt-bridge-ci-output.txt`
and `artifacts/ecowitt-bridge-ci-exit-code.txt`, exits with the suite's real
exit code):

```bash
bun run test:ecowitt-bridge:ci:artifact
```

Equivalent expanded form (the exact parity command CI, the package script,
and the local artifact script all run):

```bash
NODE_OPTIONS=--max-old-space-size=4096 bunx vitest run src/test/ecowitt-bridge-status-page.test.tsx --reporter=verbose --isolate --pool=forks
```

Rules for the ecowitt suite:

- Sandbox timeout is **not** automatically a test failure — sandbox
  capacity is the documented cause.
- CI/Linux/VPS is the authoritative environment for this suite.
- A valid result **must** include the exit code and full verbose
  output. CI captures both as artifacts in the
  `ecowitt-bridge-ci-validation` upload (see
  `artifacts/ecowitt-bridge-ci-output.txt` and
  `artifacts/ecowitt-bridge-ci-exit-code.txt`).
- Do **not** claim green unless the command completes with exit code
  `0`.

### Ecowitt CI artifact receipt

To verify a CI/Linux/VPS green receipt for the ecowitt bridge suite:

GitHub UI steps:

1. Open the CI run for the relevant commit/PR.
2. Scroll to the **Artifacts** section at the bottom of the run summary.
3. Download the `ecowitt-bridge-ci-validation` artifact.
4. Open both files in the downloaded archive:
   - `ecowitt-bridge-ci-exit-code.txt`
   - `ecowitt-bridge-ci-output.txt`

Optional GitHub CLI:

```bash
gh run download <RUN_ID> --name ecowitt-bridge-ci-validation --dir artifacts/ecowitt-bridge-ci-validation
cat artifacts/ecowitt-bridge-ci-validation/ecowitt-bridge-ci-exit-code.txt
```

Green receipt rule — **all** must be true:

- `ecowitt-bridge-ci-exit-code.txt` contains exactly `0`.
- `ecowitt-bridge-ci-output.txt` shows the ecowitt bridge suite running
  to completion (final vitest summary line present).
- No OOM / channel-closed lines anywhere in the output:
  - `JavaScript heap out of memory`
  - `FATAL ERROR: Reached heap limit`
  - `ERR_IPC_CHANNEL_CLOSED`
  - `Channel closed`

Do **not** claim green if:

- the `ecowitt-bridge-ci-validation` artifact is missing,
- the exit-code file is missing or contains `not-run`,
- the exit-code is anything other than `0`,
- the output is truncated before suite completion, or
- any of the OOM/channel-closed lines above appear.



# Disposable E2E fixture — end-to-end setup checklist

The Quick Log Playwright smoke is **write-producing**: it creates real
diary entries through the normal authenticated UI. It must therefore
**only** run against a dedicated disposable test account that owns
**no** real grower data.

This document is the end-to-end checklist for creating, verifying, and
rotating that disposable fixture. There is **no in-app automation**
that creates or deletes accounts — every step is manual and uses the
normal authenticated UI.

> See also: `e2e/README.md`, `e2e/lib/fixtureSafety.ts`,
> `e2e/lib/fixtureBootstrap.ts`.

---

## 1. Dedicated disposable test account

- Create a brand new account through the normal `/auth` UI.
- Do **not** reuse a personal account or any production grower account.
- Use an email you control (e.g. an alias or a dedicated test inbox).
- The password lives **only** in `secrets.E2E_TEST_PASSWORD`. Never
  paste it into docs, screenshots, scripts, or commit messages.

## 2. Expected fixture names

Follow the current in-app setup flow (no Grow page is surfaced):

1. Sign in to the disposable E2E account.
2. From the Dashboard, **Add Tent**.
3. Name the tent exactly `E2E Test Tent`.
4. Open that tent and **Add Plant**.
5. Name the plant exactly `E2E Test Plant`.
6. Copy the plant detail URL — this becomes `E2E_GROW_1_PLANT_URL`.

| Type  | Exact name        | Required |
|-------|-------------------|----------|
| Tent  | `E2E Test Tent`   | ✅ |
| Plant | `E2E Test Plant`  | ✅ |
| Plant | `505 Headbanger`  | optional (second plant smoke step) |
| Grow  | `E2E Test Grow`   | optional / future — only if the UI ever visibly exposes a grow name or selector |

Required names must match exactly. The fixture validator refuses to
run smoke if the tent or plant names are missing or do not contain
`E2E`/`Test` markers. The grow name is checked only when
`E2E_FIXTURE_EXPECTED_GROW_NAME` is provided and visible.

## 3. GitHub Actions secrets and variables

Configure in `Settings → Secrets and variables → Actions`:

**Secrets** (values never printed in logs or summaries):

- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`

**Variables** (names appear in logs; values do not):

- `E2E_BASE_URL`
- `E2E_GROW_1_PLANT_URL` — full URL of the `E2E Test Plant` page on the
  disposable account. Must **not** be on `verdantgrowdiary.com`.
- `E2E_FIXTURE_MODE=true`
- `E2E_FIXTURE_EXPECTED_TENT_NAME=E2E Test Tent`
- `E2E_FIXTURE_EXPECTED_PLANT_NAME=E2E Test Plant`

**Optional variables:**

- `E2E_FIXTURE_EXPECTED_GROW_NAME=E2E Test Grow` — only set if/when the
  UI visibly exposes a grow name or selector. The current setup flow
  has no Grow page, so this is **not** required and fixture
  verification will not fail when it is omitted.
- `E2E_GROW_2_PLANT_NAME` (default `505 Headbanger`)
- `E2E_FIXTURE_EXPECTED_ACCOUNT_HINT` — a short safe label (e.g. `E2E`)
  used only if the app visibly exposes the signed-in account identity.
  **Must not** be a password or token.
- `E2E_ALLOW_FIXTURE_BOOTSTRAP=true` — enables the optional UI-only
  fixture bootstrap step (see §6). Off by default.

The helper script `bun run e2e:fixture-checklist` prints these names
without reading or printing any secret value.

## 4. Verify the fixture page

Sign in as the disposable test account and open
`E2E_GROW_1_PLANT_URL`. Confirm the page visibly shows **all** of:

- `E2E` or `Test` markers
- the expected grow name (`E2E Test Grow`)
- the expected tent name (`E2E Test Tent`)
- the expected plant name (`E2E Test Plant`)

The CI step `Verify disposable E2E fixture` will hard-fail and block
the smoke if any of these are missing.

## 5. Screenshots for maintainers

Capture and store these reference screenshots locally for hand-off.
**Redact** any email, account id, plant id, or other personally
identifying value before sharing or committing.

| Screenshot | Purpose |
|------------|---------|
| Account after login | confirm dedicated test account is signed in |
| `E2E Test Grow` page | confirm grow name visible |
| `E2E Test Tent` page | confirm tent name visible |
| `E2E Test Plant` detail page | confirm plant name + E2E/Test markers |
| GitHub Actions Variables page (values redacted) | confirm variables set |

Rules for committed screenshots:

- **Never** include screenshots taken from a real/production grow.
- **Never** include emails, passwords, tokens, plant ids, or real
  grower data — redact before commit.
- Place commit-safe placeholders or redacted images under
  `e2e/docs/screenshots/`.
- A reference plant URL (`E2E_GROW_1_PLANT_URL`) must point at the
  disposable account, not at any real grow.

## 6. Optional UI-only bootstrap

A safer alternative to manual creation is the optional bootstrap spec.
It is **off by default** and must be explicitly opted into.

Requirements:

- `E2E_FIXTURE_MODE=true`
- `E2E_ALLOW_FIXTURE_BOOTSTRAP=true`
- A dedicated disposable account that contains no real grower data.

Behavior:

- Signs in via the normal storageState (no auth bypass, no
  `service_role`).
- Inspects the current UI for the exact expected E2E names.
- If all three are present, makes **no** UI changes (idempotent
  no-op).
- If any are missing and stable selectors are not wired, returns
  **blocked** with the exact `data-testid` selectors required. It will
  **never** force creation using fragile selectors.
- **Never** deletes, renames, or modifies any existing grow/tent/plant.
- **Never** creates non-E2E names.

Run locally:

```bash
bun run e2e:bootstrap-fixture
```

In CI, the bootstrap step runs only when
`vars.E2E_ALLOW_FIXTURE_BOOTSTRAP == 'true'`. Fixture verification
still runs afterwards; smoke is still gated on verification success.

## 7. Rotate or recreate the disposable E2E account

Use this process when the disposable account is compromised, lost, or
should be rotated:

1. Create a **new** dedicated test account through the normal `/auth`
   UI. Do not reuse a personal or production grower account.
2. Sign in as the new account and create (or bootstrap) only the
   expected E2E fixture names (§2).
3. Update GitHub Actions **secrets**:
   - `E2E_TEST_EMAIL`
   - `E2E_TEST_PASSWORD`
4. Update GitHub Actions **variables**:
   - `E2E_GROW_1_PLANT_URL` (new plant URL on the new account)
   - `E2E_FIXTURE_MODE=true`
   - expected grow/tent/plant names (unchanged if reused)
   - optional `E2E_FIXTURE_EXPECTED_ACCOUNT_HINT`
5. Trigger a manual `workflow_dispatch`.
6. Confirm the `Verify disposable E2E fixture` step passes **before**
   any smoke writes occur.
7. Stop using the old test account externally. Do **not** add in-app
   deletion automation. Disable the old credentials outside the app
   (e.g. rotate the alias/email or change the password via normal
   account flows) if required.

There are **no hardcoded credentials** anywhere in the repository,
workflows, scripts, or docs. Credentials live only in GitHub Actions
secrets and the local developer's environment.

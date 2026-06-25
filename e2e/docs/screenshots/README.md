# E2E fixture screenshots

This directory holds **redacted** reference screenshots that help
maintainers verify the disposable E2E fixture is set up correctly.

## Rules

- **Never** commit screenshots taken from a real or production grow.
- **Never** commit screenshots containing emails, passwords, tokens,
  plant ids, account ids, or any other personally identifying value —
  redact before commit.
- Only include images that show the dedicated disposable E2E account
  with the expected fixture names (`E2E Test Tent`, `E2E Test Plant`,
  and optionally `E2E Test Grow` if/when the UI exposes a grow name).

## Expected screenshots (maintainers should capture locally)

Add the redacted PNGs into this folder using these filenames:

- `01-account-after-login.png` — confirm the dedicated test account is
  signed in (redact the email).
- `02-e2e-test-tent.png` — confirm the tent name is visible.
- `03-e2e-test-plant.png` — confirm the plant detail page shows
  `E2E Test Plant` and E2E/Test markers.
- `04-e2e-test-grow.png` — *optional*; only when the UI visibly
  exposes a grow name or selector.
- `05-github-actions-variables.png` — confirm variables exist with
  values redacted.

> Add screenshot here after creating disposable fixture.

See `e2e/FIXTURE_SETUP.md` for the full setup and rotation checklist.

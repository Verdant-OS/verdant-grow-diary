# npm compatibility lock review — 2026-09-25

Repository review by Codex, based on deploy tip
`2f67a54583e20a4b10debf8c4883a887d8a402b6`. Dependency repair #1343 is
separate and unmerged. Independent review: Grok, pending.
This is a repository CI decision, not production or release acceptance.

## Decision and reason

Retain the synchronized `package-lock.json` for a bounded seven-day review window,
through **2026-10-02**. The existing strictly-greater date check first rejects an
overdue review on **2026-10-03 UTC**. Bun and `bun.lock` remain canonical.

The current review date would reject the compatibility-lock policy on 2026-09-26.
Removing the compatibility lock now would break the remaining workflow
and contradict the documented setup contracts. Renewing the date after enumerating
those contracts keeps the expiry gate useful without
silently deleting consumers or disabling the expiry check.

## Enumerated consumer evidence

These are four repository contracts, not four deployments. Every configured marker
was checked against source; the policy scanner found no undeclared npm consumers.

| Contract                                         | Source evidence at the reviewed base                          | Status                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `.github/workflows/seo-monitoring.yml`           | The install step uses npm ci, with npm install fallback.      | PASS: workflow source still consumes npm. Its hosted execution was not measured here.   |
| `README.md`                                      | The build instructions invoke npm run build.                  | PASS: local build contract remains documented.                                          |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Local setup invokes npm install with an isolated userconfig.  | PASS: local setup contract remains documented.                                          |
| `docs/preview-deployment-verification.md`        | The dashboard checklist lists npm install/build/dev commands. | PASS: documentation still declares npm; actual dashboard configuration is NOT_MEASURED. |

`vercel.json` already pins Bun install and build commands and is correctly absent
from this inventory. Its source does not prove that every external dashboard or
preview deployment follows those commands. Reconcile the preview checklist before
removing its contract; do not infer a production change from either file.

## Controls preserved

Only the reason and review date change in
`config/dependency-lockfile-transition.json`. No consumer or marker is removed.
The owner, canonical manager, required locks, security floors, audit thresholds,
expiry comparison, and manifest/lock contents are unchanged. There is no new
security exception, package resolution, application change, migration or secret.

The deploy tip still has separate dependency-security findings; #1343 owns their
repair. This review-date change does not resolve or waive those findings. Its
own guard and date-boundary results are recorded in the PR receipt.

## Validation and next review

Use the existing `evaluatePolicy({ today })` entrypoint to check the repository
at 2026-09-25, 2026-09-26, 2026-10-02 and 2026-10-03. The first three dates must
pass, and the last must fail only with the overdue-review diagnostic. Run the
existing lockfile-policy tests and documentation safety check without weakening
their assertions or timeouts.

Before the next review, the dependency security owner should retire or reconcile
each remaining npm contract with its actual workflow/setup path, then reassess
whether the compatibility lock can be removed. A later extension requires another
recorded inventory and reason; this decision is not an automatic renewal.

## Risk and rollback

Keeping two locks retains synchronization work; the existing semantic and version
floor gates continue enforcing it. Reverting this two-file change restores the
2026-09-25 deadline and its fail-closed result from 2026-09-26. No data rollback is
needed. HOLD #1250. No merge, Publish, production APPLY, device/AQ, credentials or
production acceptance is authorized by this review.

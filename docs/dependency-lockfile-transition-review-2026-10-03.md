# npm compatibility lock review — 2026-10-03

Repository review by Claude, on Matthew Cheek's instruction of 2026-10-03 to bump the
transition review date. Based on deploy tip `80176bad5c9c6ef6a2d8d53faaf65d55e68f06b1`.
Previous review: [`dependency-lockfile-transition-review-2026-09-25.md`](dependency-lockfile-transition-review-2026-09-25.md).
This is a repository CI decision, not production or release acceptance.

## Decision and reason

Retain the synchronized `package-lock.json` for another bounded seven-day window,
through **2026-10-10**. The existing strictly-greater date check first rejects an
overdue review on **2026-10-11 UTC**. Bun and `bun.lock` remain canonical.

The 2026-10-02 review date began rejecting the policy on 2026-10-03 UTC: the
`check-bun-lockfile-policy` lane failed with only the overdue-review diagnostic. The
2026-09-25 review asked the owner to retire or reconcile the remaining npm contracts
before the next review. That has not happened. The four references below are unchanged,
and removing the compatibility lock today would still break the SEO workflow's `npm ci`.
The owner chose to extend rather than remove. This review records the re-inventory and
the reason, as the 2026-09-25 review required for any later extension.

## Re-inventoried npm references

These are the same four configured repository references, re-checked against source at
the deploy tip above. They are not four verified lockfile consumers or deployments.
`evaluatePolicy` found every configured marker and no undeclared npm reference in the
paths it scans.

| Contract                                         | Source evidence at the reviewed base                                | Status                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.github/workflows/seo-monitoring.yml`           | Line 50 runs npm's `ci` subcommand, with `install` fallback.        | PASS: executable workflow source uses the committed lock for `ci`. Hosted execution is NOT_MEASURED. |
| `README.md`                                      | Line 112 invokes `npm run build`.                                   | PASS: npm is documented; this command alone does not require a committed npm lock.                   |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Line 43 invokes npm's `install` subcommand, then restores the lock. | PASS: npm is documented; this procedure does not establish a lockfile dependency.                    |
| `docs/preview-deployment-verification.md`        | Lines 21–23 list npm's install, build and dev commands.             | PASS: npm is documented. Actual dashboard configuration and execution are NOT_MEASURED.              |

`vercel.json` still pins `bun install --frozen-lockfile` and `bun run build`, and is
correctly absent from this inventory. That source does not prove which commands an
external dashboard or preview deployment runs.

## Controls preserved

Only the reason and review date change in
`config/dependency-lockfile-transition.json`. No consumer or marker is removed. The
owner, canonical manager, required locks, security floors, audit thresholds, expiry
comparison, and manifest/lock contents are unchanged. There is no new security
exception, package resolution, application change, migration or secret.

## Validation and next review

Use the existing `evaluatePolicy({ today })` entrypoint to check the repository at
2026-10-03 and 2026-10-10 (both must pass) and at 2026-10-11 (must fail only with the
overdue-review diagnostic). Run the existing lockfile-policy tests without weakening
their assertions.

The 2026-09-25 follow-up still stands, and it is now overdue once. Before 2026-10-10,
the dependency security owner should either:

- move `seo-monitoring.yml` to Bun, or otherwise reconcile it, and re-assess removing
  `package-lock.json`; or
- record why the compatibility lock must stay.

Another extension needs another recorded inventory and reason. This review is not an
automatic renewal.

## Risk and rollback

Keeping two locks keeps the synchronization work; the existing semantic and
version-floor gates continue to enforce it. Reverting this two-file change restores the
2026-10-02 deadline and its fail-closed result. No data rollback is needed. No merge,
Publish, production APPLY, device or Action Queue operation, credential, or production
acceptance is authorized by this review.

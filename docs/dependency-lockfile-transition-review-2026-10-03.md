# npm compatibility lock review — 2026-10-03

Repository review by Claude, at the owner's request, based on deploy tip
`80176bad5c9c6ef6a2d8d53faaf65d55e68f06b1` (#1864). It follows
[the 2026-09-25 review](dependency-lockfile-transition-review-2026-09-25.md).
This is a repository CI decision, not production or release acceptance.

## Decision and reason

Retain the synchronized `package-lock.json` for another bounded seven-day window,
through **2026-10-10**. The existing strictly-greater date check first rejects an
overdue review on **2026-10-11 UTC**. Bun and `bun.lock` remain canonical.

The 2026-10-02 deadline began failing the `Lockfile policy, dependency audit,
typecheck, build, tests` job on 2026-10-03 for every open pull request and the
deploy branch alike. That job is not one of the 35 required contexts, but the
failure hides any real lockfile drift behind a date. The four npm references the
previous review enumerated are all still present, so removing the compatibility
lock today would still break the SEO workflow and contradict the documented setup
contracts.

The previous review asked the dependency security owner to retire or reconcile
each remaining npm contract before this date. **None was retired.** This renewal
records that gap instead of hiding it; it is not an automatic renewal.

## Enumerated npm references

Re-checked against source at the reviewed base. These are four configured
repository references, not four verified lockfile consumers or deployments. The
policy scanner found no undeclared npm references in the paths it scans: with the
old date, the overdue review was its only error.

| Contract                                         | Source evidence at the reviewed base                                        | Status                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.github/workflows/seo-monitoring.yml`           | Line 50 runs npm's `ci` subcommand, with `install` fallback.                | PASS: executable workflow source uses the committed lock for `ci`. Hosted execution is NOT_MEASURED. |
| `README.md`                                      | Line 112 invokes `npm run build`.                                           | PASS: npm is documented; this command alone does not require a committed npm lock.                   |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Line 43 runs npm's `install` subcommand with a public-registry user config. | PASS: npm is documented; this procedure does not establish a lockfile dependency.                    |
| `docs/preview-deployment-verification.md`        | Line 21 onward lists npm's install, build and dev commands.                 | PASS: npm is documented. Actual dashboard configuration and execution are NOT_MEASURED.              |

`vercel.json` still pins `bun install --frozen-lockfile` and `bun run build`, and is
correctly absent from this inventory. Its source does not prove that every external
dashboard or preview deployment follows those commands.

Since the previous review, #1864 changed both locks to declare `js-yaml` directly,
and the policy reported the compatibility lock synchronized. That is the only lock
change in the window that this review relies on.

## Controls preserved

Only the reason and review date change in
`config/dependency-lockfile-transition.json`. No consumer or marker is removed.
The owner, canonical manager, required locks, security floors, audit thresholds,
expiry comparison, and manifest/lock contents are unchanged. There is no new
security exception, package resolution, application change, migration or secret.
This change does not resolve or waive any separate dependency-audit finding.

## Validation and next review

`evaluatePolicy({ today })` is checked at 2026-10-03, 2026-10-10 and 2026-10-11:
the first two must pass, and the last must fail only with the overdue-review
diagnostic. The existing lockfile-policy tests run unchanged.

Before 2026-10-10 the dependency security owner should do one of the following,
and record it:

1. Retire or reconcile the four npm contracts, starting with the SEO workflow's
   `ci` subcommand, then remove `package-lock.json` and this transition config together.
2. Or renew again with a fresh inventory and a reason that names the blocker.

## Risk and rollback

Keeping two locks retains synchronization work; the existing semantic and version
floor gates continue enforcing it. Reverting this two-file change restores the
2026-10-02 deadline and its fail-closed result. No data rollback is needed. No
merge, Publish, production APPLY, device or Action Queue operation, credentials or
production acceptance is authorized by this review.

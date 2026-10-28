# npm compatibility lock review — 2026-10-10 fallback

Repository fallback by Canopy, opened as a draft under standing pre-approval for draft
PRs. Based on deploy tip `15525dca48f4986bbd01560cc3b68516a51d4d46`. Previous review:
[`dependency-lockfile-transition-review-2026-10-03.md`](dependency-lockfile-transition-review-2026-10-03.md).
This is a repository CI decision, not production or release acceptance. It is superseded
if #1870 and #1873 merge first.

## Decision and reason

Retain the synchronized `package-lock.json` for another bounded seven-day window,
through **2026-10-17**. The existing strictly-greater date check first rejects an
overdue review on **2026-10-18 UTC**. The current `reviewBy` of 2026-10-10 first fails
at **2026-10-11T00:00Z** (7 PM CT on 2026-10-10). Bun and `bun.lock` remain canonical.

The real fix is merging #1870 (SEO monitoring installs with Bun) and then #1873
(retire `package-lock.json`). Those drafts, plus #1879 and #1876, already edit this
transition. This fallback only moves the review date so the lockfile policy shard does
not go red on every PR if those drafts miss the deadline. It does not remove a
consumer, change a lockfile, or replace that stack.

The 2026-10-03 review asked for another recorded inventory before any later extension.
The four references below are unchanged at this tip, and removing the compatibility
lock today would still break the SEO workflow's lock-dependent install.

## Re-inventoried npm references

These are the same four configured repository references, re-checked against source at
the deploy tip above. `evaluatePolicy` at `today` 2026-10-10 found every configured
marker and no other error. They are not four verified deployments.

| Contract                                         | Source evidence at the reviewed base                                | Status                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.github/workflows/seo-monitoring.yml`           | Line 50 runs npm's `ci` subcommand, with `install` fallback.        | PASS: executable workflow source uses the committed lock for `ci`. Hosted execution is NOT_MEASURED. |
| `README.md`                                      | Line 112 invokes `npm run build`.                                   | PASS: npm is documented; this command alone does not require a committed npm lock.                   |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Line 43 invokes npm's `install` subcommand, then restores the lock. | PASS: npm is documented; this procedure does not establish a lockfile dependency.                    |
| `docs/preview-deployment-verification.md`        | Lines 21–23 list npm's install, build and dev commands.             | PASS: npm is documented. Actual dashboard configuration and execution are NOT_MEASURED.              |

`vercel.json` still pins `bun install --frozen-lockfile` and `bun run build`, and is
correctly absent from this inventory.

## Controls preserved

Only the reason and review date change in
`config/dependency-lockfile-transition.json`. No consumer or marker is removed. The
owner, canonical manager, required locks, security floors, audit thresholds, expiry
comparison, and manifest/lock contents are unchanged. There is no new security
exception, package resolution, application change, migration or secret.

## Validation and next review

Use the existing `evaluatePolicy({ today })` entrypoint. At `reviewBy` 2026-10-10, both
2026-10-10 (pass) and 2026-10-11 (fail only with the overdue-review diagnostic) were
measured before this change. After it, 2026-10-11 and 2026-10-17 must pass, and
2026-10-18 must fail only with the overdue-review diagnostic.

Before 2026-10-17, merge #1870 and #1873, or record why the compatibility lock must
stay. Another extension needs another recorded inventory and reason. This review is not
an automatic renewal.

## Risk and rollback

Keeping two locks keeps the synchronization work; the existing semantic and
version-floor gates continue to enforce it. Reverting this change restores the
2026-10-10 deadline and its fail-closed result on 2026-10-11 UTC. No data rollback is
needed. No merge, Publish, production APPLY, device or Action Queue operation,
credential, or production acceptance is authorized by this review. Merging this draft
needs an outside reviewer (Codex, Blue Dream, Critical Mass, or Durban Poison) and
Matthew's yes.

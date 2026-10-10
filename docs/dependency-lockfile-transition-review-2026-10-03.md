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
and removing the compatibility lock today would still break the SEO workflow's lock-dependent install.
The owner chose to extend rather than remove. This review records the re-inventory and
the reason, as the 2026-09-25 review required for any later extension.

## Re-inventoried npm references

These are the same four configured repository references, re-checked against source at
the deploy tip above. They are not four verified lockfile consumers or deployments.
`evaluatePolicy` found every configured marker and no undeclared npm reference in the
paths it scans.

| Contract                                         | Source evidence at the reviewed base                                | Status                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/seo-monitoring.yml`           | Line 50 runs npm's `ci` subcommand, with `install` fallback.        | PASS: executable workflow source uses the committed lock for `ci`. Hosted execution is NOT_MEASURED.                                            |
| `README.md`                                      | Line 112 invokes `npm run build`.                                   | PASS: npm is documented; this command alone does not require a committed npm lock.                                                              |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Line 43 invokes npm's `install` subcommand, then restores the lock. | Historical npm bootstrap: without package-lock.json it resolves an unpinned tree, bypassing Bun’s minimum-age delay and locked security floors. |
| `docs/preview-deployment-verification.md`        | Lines 21–23 list npm's install, build and dev commands.             | PASS: npm is documented. Actual dashboard configuration and execution are NOT_MEASURED.                                                         |

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

## Addendum — SEO monitoring moved to Bun (2026-10-03)

On the owner's instruction, the first follow-up option above is taken in a stacked
change. `.github/workflows/seo-monitoring.yml` now installs with
`bun install --frozen-lockfile`, after the same pinned `oven-sh/setup-bun` 1.3.14 and
`bun.lock`-keyed install cache that the other Bun workflows use. `setup-node` stays at
Node 20 because the job runs its scripts with `node` and its own workflow test pins that
version. Its `consumerContracts` entry is removed, because a declared consumer that no
longer carries its marker fails the policy.

At that stacked revision, three npm references remained. The bootstrap needed the npm
lock to retain reproducible resolutions and security floors; removing the lock made
that fallback unpinned:

| Contract                                         | What it is                                                           | Lock-dependent?                           |
| ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| `README.md`                                      | Documented build command.                                            | No                                        |
| `.claude/skills/run-verdant-grow-diary/SKILL.md` | Historical public-registry bootstrap; unpinned without the npm lock. | Yes for reproducible, floor-checked setup |
| `docs/preview-deployment-verification.md`        | Preview dashboard checklist.                                         | No                                        |

Every script the SEO job runs, and every test it spawns, imports only Node built-ins
(measured over `scripts/seo/*.mjs` and the ten `scripts/test-seo-*.mjs` files the job
runs). The job therefore needs no installed packages. The install step is kept to match
the requested Bun move and the repository pattern; removing it would be a separate
change.

Removing `package-lock.json` itself is still the dependency security owner's decision,
and lockfile changes stay owner-gated. This addendum does not remove it. Hosted
execution of the edited workflow is NOT_MEASURED until it runs, which happens after a
successful `ci` run on `verdant-grow-diary` or a manual dispatch.

## Addendum — npm compatibility lock retired (2026-10-03)

On the owner's instruction, `package-lock.json` is removed in a third stacked change, and
the transition ends. `bun.lock` is now the only lockfile.

- `scripts/check-bun-lockfile-policy.mjs` requires only `bun.lock` and lists
  `package-lock.json` among the forbidden lockfiles. Every security floor the removed
  `package-lock.json` checks enforced now applies to `bun.lock`: vite, postcss, fast-uri,
  form-data, ajv and picomatch join the Bun floors, and the minimatch 3.x/9.x floors move
  over too. All were already satisfied by `bun.lock` at the time of removal.
- `config/dependency-lockfile-transition.json` moves to `schemaVersion: 2`. It drops
  `compatibilityLockfile` and `reviewBy`; the policy rejects either key. It keeps the
  exact allowlist of npm command text, so any new undeclared npm package-install
  entrypoint still fails the policy.
- `scripts/check-npm-lock-semantic.mjs` and its `check:npm-lock-semantic` script are
  removed, with nothing left to check.
- `scripts/check-dependency-security.mjs` audits with `bun audit` only. The npm audit
  source, the `--npm-input` and `--npm-lockfile` flags, and the npm-lock reads are gone.
  The npm graph comparison is removed as well: exceptions bind to `bun.lock` only, the
  retired `expectedNpm*` exception fields are rejected, and `--lockfile` must name a
  `bun.lock` file, so no caller can trigger a second dependency-graph check (#1879).
- `.gitignore` ignores `package-lock.json`. The original retirement revision deleted
  the lock written by the npm bootstrap; that fallback was unpinned and bypassed
  Bun’s minimum-age delay and locked security floors. It is replaced below.

The historical bootstrap described above is superseded by the frozen local setup
in the October 4 addendum below.

Follow-ups not done here:

- `CLAUDE.md` still calls `package-lock.json` a synchronized compatibility lock. It is a
  versioned governance file, so its correction needs the twelve-file `Sentinel-Version`
  bump.
- `docs/architecture-contract.md` AC-8.1 states the old two-lockfile rule. Correcting it
  needs a §15 restamp.
- The reviewed-exception schema still carries npm-specific fields. There are no
  exceptions today, so nothing exercises them. _Done in a later stacked change:_
  `config/dependency-security-exceptions.json` moves to `schemaVersion: 2`, which binds an
  exception to `bun.lock` only and rejects the six retired `expectedNpm*` fields.

## Addendum — locked local setup and review corrections (2026-10-04)

Matthew explicitly approved this lockfile change on October 4. PR #1870 remains
open, draft and unmerged as checked on 2026-10-04; this branch already carries its
SEO Bun install, but that does not establish that the deploy branch has it.

The run skill now uses only `bun install --frozen-lockfile` when dependencies are
absent. A frozen-install failure is BLOCKED, with its exact error reported; an
unpinned npm bootstrap is not a supported recovery path. Its npm consumer entry is
removed, leaving only the README build command and historical preview checklist.
The historical preview install text is unpinned without an npm lock; it does not
instruct current setup. The earlier sections describe their dated revisions.

The lockfile policy also rejects workflow npm caches and cache keys that hash the
retired npm lock. Stale package-lock entries in formatter/reviewer exclusions and
the stabilization scope allowlist are removed. Security floors, audit thresholds
and exact exception policy remain unchanged.

The recorded 35/35 hosted check result at `b47799c00fb1102aafc1483002d1786142ff70d7`
predates the October 4 GitHub billing lock; it is historical evidence, not current
head CI. New-head hosted checks and full independent re-review remain required.
After #1870 lands, a clean independent PASS and 35/35 required checks at the exact
head route this PR through Grok 91’s merge queue, with #1879 immediately afterward.
The author keeps this PR draft and does not merge or enable auto-merge. These status
and routing statements are dated evidence, not test-pinned policy.

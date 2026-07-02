# Verdant SEO Monitoring v1

Post-deploy Google Search Console (GSC) monitoring. Read-only. No product
UI, schema, RLS, Edge Function, or auth changes.

## Scope

- URL Inspection API (bounded run per deploy)
- Sitemap-driven URL discovery
- Verification of the last tracked GSC finding
- Sanitized JSON + Markdown reports under `artifacts/seo/`
- CI upload on success and failure
- No secrets in logs, artifacts, or the repo

## One-time local OAuth (Matthew)

You (the GSC-owning Google account) authorize once locally. Nothing is
committed. The refresh token stays on your machine unless you copy it
manually into GitHub Actions secrets.

1. In Google Cloud Console, create an OAuth 2.0 Client ID (type "Web
   application"). Authorized redirect URI:
   `http://localhost:53682/oauth2callback`.
2. Export the credentials in your shell (do not paste them in chat):

   ```bash
   export GSC_CLIENT_ID="..."
   export GSC_CLIENT_SECRET="..."
   export GSC_SITE_URL="https://verdantgrowdiary.com/"
   ```

3. Run the helper:

   ```bash
   node scripts/seo/gsc-oauth.mjs
   ```

   Open the printed URL, approve the read-only scope
   (`webmasters.readonly`), and the local server captures the code and
   writes `.seo/gsc-token.local.json` (mode 0600, gitignored).

4. Optional — print GitHub Actions instructions (refresh token stays
   redacted unless you also pass `--reveal`):

   ```bash
   node scripts/seo/gsc-oauth.mjs --print-github-secret-instructions
   ```

## GitHub Actions secrets

Add these repo secrets (Settings → Secrets and variables → Actions):

- `GSC_CLIENT_ID`
- `GSC_CLIENT_SECRET`
- `GSC_REFRESH_TOKEN` (from `.seo/gsc-token.local.json`)
- `GSC_SITE_URL` (e.g. `https://verdantgrowdiary.com/`)

If any are missing, the `SEO Monitoring (post-deploy)` workflow marks
the GSC step **skipped** (not failed) and uploads an artifact explaining
that OAuth is not configured.

## Workflow

`.github/workflows/seo-monitoring.yml`

- Runs on successful completion of the `ci` workflow, or on
  `workflow_dispatch`.
- Inspects up to `max_urls` URLs (default 15, hard cap 50) pulled from
  the sitemap.
- Verifies the last tracked GSC finding
  (`config/seo-last-gsc-finding.json`).
- Uploads `artifacts/seo/**` on success and failure. Excludes anything
  matching `*.env`. Never uploads `.seo/gsc-token.local.json` — that
  path is gitignored and never checked out in CI.
- Fails the job when the inspection or verification scripts exit
  non-zero (i.e. new critical issue or unresolved finding).

## Critical issue codes

Emitted by `scripts/seo/gsc-inspect-urls.mjs`:

- `verdict_not_pass`
- `not_indexed`
- `blocked_by_robots`
- `noindex_detected`
- `fetch_failed`
- `canonical_mismatch`
- `mobile_usability`
- `rich_results`
- `inspection_error`

Pass `--allow <url,url>` or `--expected-noindex` to exempt URLs that
are intentionally non-indexable (e.g. `/auth`).

## Last-finding config

`config/seo-last-gsc-finding.json`:

```json
{
  "finding_id": "last-gsc-finding",
  "description": "Describe the remaining GSC issue here",
  "affected_urls": ["https://verdantgrowdiary.com/"],
  "expected_resolution": {
    "indexing_allowed": true,
    "robots_allowed": true,
    "noindex_absent": true,
    "canonical_matches": true
  }
}
```

Update the description and `affected_urls` when a new GSC UI issue
appears; the post-deploy workflow will re-verify it every run.

## Safety

- Uses OAuth read-only scope `webmasters.readonly`.
- No service_role usage.
- No Supabase / schema / RLS / Edge Function / auth changes.
- No tokens printed in CI logs.
- Refresh token never committed (`.seo/` is gitignored).
- Reports contain only URL, verdict, coverage state, robots/indexing
  state, canonical URLs, and timestamps returned by the public GSC API.

## Tracked allowlist (`config/seo-allowlist.json`)

The inspection runner reads a tracked allowlist so CI only fails on
*new* critical issues. Three sections:

- **`allowlisted_issues`** — suppress specific `issue_types` on URLs
  matching `url_patterns` (glob `*`). Each entry has an `id`,
  `description`, and optional `expires_on` (YYYY-MM-DD; expired
  entries are ignored automatically).
- **`expected_noindex`** — URLs allowed to be non-indexable. Treated
  as `--expected-noindex` on a per-URL basis.
- **`never_allowlist`** — critical public URLs (home, `/welcome`,
  `/pricing`, `/hardware-integrations`, `/sitemap.xml`,
  `/robots.txt`). Issues on these URLs are **never** suppressed, and
  `validateAllowlist` refuses any allowlist pattern that would
  capture them.

Runner flags:

- `--allowlist <path>` — override the default `config/seo-allowlist.json`.
- `--no-allowlist` — disable the tracked allowlist for a run.

Suppressed issues are reported in `artifacts/seo/gsc-url-inspection.{json,md}`
under `suppressed_issue_count` / "Suppressed by allowlist", with the
matching `id` attached for audit.

### Tests

```bash
node --test scripts/test-seo-allowlist.mjs scripts/test-seo-allowlist-config.mjs
```

The workflow runs both files before invoking the inspection runner, so
a malformed or too-broad allowlist fails CI before any GSC call.

## Last-finding verification safety

`scripts/seo/verify-last-gsc-finding.mjs` refuses to mark the tracked
finding "resolved" unless authenticated URL Inspection actually
confirms every `expected_resolution` check. It emits
`status: "skipped"` (exit 0) when:

- GSC OAuth is not configured (missing `GSC_*` secrets), or
- `config/seo-last-gsc-finding.json` still contains the placeholder
  description or has an empty `affected_urls` list.

Update `config/seo-last-gsc-finding.json` with a real description and
one or more `affected_urls` before expecting a "resolved" verdict.

## Allowlist dry-run mode

Preview which URLs / issues the tracked allowlist would suppress
**without calling the Google Search Console API**:

```bash
node scripts/seo/gsc-inspect-urls.mjs --dry-run-allowlist \
  --urls "https://verdantgrowdiary.com/,https://verdantgrowdiary.com/auth/callback"
```

Writes:

- `artifacts/seo/seo-allowlist-dry-run.json`
- `artifacts/seo/seo-allowlist-dry-run.md`

Each row shows whether the URL is `never_allowlisted`, whether it
would be treated as expected-noindex, which issue types would be
suppressed, and which allowlist entry IDs match. No credentials are
loaded; no tokens are touched.

## Allowlist expiration guard

Every allowlist entry can carry `expires_on` (YYYY-MM-DD). The runner
computes expired entries with `findExpiredEntries()` and, by default,
**fails with exit code 3** in both dry-run and live modes when any
entry has expired. This prevents stale suppressions from silently
hiding real regressions.

Flags:

- `--no-fail-on-expired` — treat expired entries as informational only.
- `--now <iso>` — override "now" (used by tests only).

Expired entries always appear in
`artifacts/seo/seo-allowlist-suppressions.{json,md}` under
`expired_entries` for auditability.

## Suppression artifacts (always uploaded)

Every run — dry-run, skipped (no OAuth), or live — writes:

- `artifacts/seo/seo-allowlist-suppressions.json`
- `artifacts/seo/seo-allowlist-suppressions.md`

These list every allowlist-suppressed issue grouped by the allowlist
entry `id` that suppressed it, plus any expired entries. The workflow
step that uploads `artifacts/seo/**` runs with `if: always()`, so
these reports are available for every run (success or failure) without
uploading any secrets, `.env`, `.seo/`, OAuth token JSON, refresh
tokens, or Search Console exports.

## Diagnostics polish (v1.2)

Additional operator affordances in `scripts/seo/gsc-inspect-urls.mjs`:

- `--list-expired-entries` — no GSC calls. Prints expired allowlist
  entries and writes `artifacts/seo/seo-allowlist-expired.{json,md}`.
  Exits `3` when expired entries exist (unless `--no-fail-on-expired`).
- Dry-run artifacts now include per-URL classification
  (`never_allowlisted | suppressed | expected_noindex |
  expired_allowlist | no_match`), matched entry ids (active and
  expired), suppression reasons, and totals.
- Every run writes `artifacts/seo/seo-job-summary.md` and, when
  running under GitHub Actions, appends it to `$GITHUB_STEP_SUMMARY`.
  The summary contains only ids, counts, and status — never env
  values, tokens, `.env` contents, or `.seo/` payloads.

`scripts/seo/verify-last-gsc-finding.mjs` also refuses to declare
"resolved" (status becomes `unresolved_expired_allowlist`) if any
expired allowlist entry still covers an affected URL, preventing
stale suppression from masking regressions.

## v1.3 diagnostics polish

### Regression-only verification mode

`scripts/seo/verify-last-gsc-finding.mjs` accepts
`--fail-only-previously-resolved-expired`. In this mode the script makes
**no GSC API calls** — instead it compares the tracked finding's
`affected_urls` against:

1. the previous run's `gsc-last-finding-verification.json`
   (default: `artifacts/seo/previous/gsc-last-finding-verification.json`,
   override with `--previous <path>`), and
2. currently expired allowlist entries covering each URL.

A URL is a **regression** only if it was previously resolved AND is now
covered by an expired allowlist entry. Exit codes:

- `0` — no regression (also when no previous artifact is available)
- `4` — one or more regressions detected

The mode is safe against placeholder configs (it exits `0` with `status:
"skipped"`).

### Stable artifact links & JSON job summary

`gsc-inspect-urls.mjs` now writes `artifacts/seo/seo-job-summary.json`
alongside the Markdown summary. It contains structured status,
classification counts, live suppression totals, expired entries, the
suppression diff summary, and an `artifacts` map with the canonical
paths of every report file (stable across runs).

### Compact suppression table

`seo-allowlist-suppressions.md` starts with a compact table that groups
suppressed issues by allowlist entry with counts and unique issue codes,
so reviewers see the picture without scrolling through per-issue lists.

### Previous-run suppression diff

When a `--previous-dir` (default `artifacts/seo/previous`) contains a
prior `seo-allowlist-suppressions.json`, the runner now writes:

- `artifacts/seo/seo-allowlist-suppressions-diff.json`
- `artifacts/seo/seo-allowlist-suppressions-diff.md`

listing suppressions **added** and **removed** since the previous run.
The CI workflow downloads the last successful run's `seo-monitoring-reports`
artifact into `artifacts/seo/previous/` before running dry-run and live
inspection, so the diff surfaces automatically on every scheduled run.
Pass `--no-diff` to disable the diff artifacts locally.

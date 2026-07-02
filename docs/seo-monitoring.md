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

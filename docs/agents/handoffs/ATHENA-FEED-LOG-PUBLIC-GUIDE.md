### ATHENA-FEED-LOG-PUBLIC-GUIDE

```text
TASK ATHENA-FEED-LOG-PUBLIC-GUIDE  priority: other  status: OPEN
goal: Ship the public Athena planned-vs-actual feed log at /guides/athena-feed-chart-log as a draft PR. No merge and no deploy.
why: The standalone HTML log needs the same public-route, sitemap, and consent-gated analytics pattern as the Advanced Nutrients feed log, with no browser or server storage and no invented Athena dosages.
branch: cursor/athena-feed-chart-log-431f
base: verdant-grow-diary
checkout: git fetch origin cursor/athena-feed-chart-log-431f verdant-grow-diary && git switch cursor/athena-feed-chart-log-431f && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: opened as a draft from this branch; read the PR URL from GitHub after the first push
head_sha: 2db14d480136d50737460569b2e7d62e9a496023, the formula-guard commit and the parent of the commit that records this line. Read origin/cursor/athena-feed-chart-log-431f for the exact PR head.
state: pushed draft once this commit is on the remote
current_step: APP_ROUTES lists /guides/athena-feed-chart-log before /guides/grow-stage-care-guide so the path sort matches Array.sort. The CSV download appends the anchor, clicks it without preventDefault, and revokes the object URL on the next turn. escapeCsvField prefixes a cell that starts with = + - @ tab or CR with a single quote. e2e/athena-feed-chart-log-csv.spec.ts runs from .github/workflows/mocked-e2e-unwired-closure.yml. The latest verdant-grow-diary was merged with a normal merge.
next_action: read required CI on the new head. The pheno-comparison-v0 failure at 07f3de95 was the same unsorted manifest, because that workflow path-filters src/lib/appRouteManifest.ts. Do not merge. Do not deploy.
post_merge_check: NOT_APPLICABLE until merge is requested. After a future merge, confirm https://verdantgrowdiary.com/guides/athena-feed-chart-log returns the page and /version.json reports the merge SHA.
active_writer: Cursor Grok cloud agent on cursor/athena-feed-chart-log-431f
decisions: Planned amounts start blank. The page does not embed Athena dosages. Tolerance default is 10% and is labeled as the grower's setting. Analytics events are feed_log_* and fire only when readAnalyticsConsent() is granted. All three CTAs use Link to /auth?mode=signup, the same href and cta_location click tracking as draft #2542. The Advanced Nutrients reverse link is not on this base; it needs to land with or after draft #2542. /vpd-chart is not a route on this base, so the VPD chart label points at /guides/grow-room-vpd-tracker.
tried_and_rejected: Reusing src/lib/publicFeedLogRules.ts from #2542 was rejected because that module is not on verdant-grow-diary. Athena-specific modules avoid a hard dependency and keep the shared SEO edits additive.
commands: NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; bunx vitest run src/test/athena-feed-log-rules.test.ts src/test/athena-feed-log-page.test.tsx src/test/athena-feed-log-analytics.test.ts src/test/verdant-seo-sitemap-robots.test.ts src/test/verdant-seo-guides-public-links.test.tsx src/test/route-indexation-matrix.test.ts src/test/static-public-seo-documents.test.ts
files_touched: src/lib/athenaFeedLogRules.ts src/lib/athenaFeedLogAnalytics.ts src/pages/AthenaFeedLog.tsx src/routes/guides.athena-feed-chart-log.tsx src/routeTree.gen.ts src/lib/appRouteManifest.ts src/lib/build/staticPublicSeoDocuments.ts public/sitemap.xml docs/seo/route-indexation-matrix.md src/pages/GuidesIndex.tsx src/constants/verdantSeoContent.ts scripts/seo-runtime-smoke.mjs e2e/auth-route-protection-mobile.spec.ts e2e/athena-feed-chart-log-csv.spec.ts .github/workflows/mocked-e2e-unwired-closure.yml src/test/athena-feed-log-rules.test.ts src/test/athena-feed-log-page.test.tsx src/test/athena-feed-log-analytics.test.ts src/test/verdant-seo-sitemap-robots.test.ts src/test/verdant-seo-guides-public-links.test.tsx src/test/static-public-seo-documents.test.ts docs/agents/HANDOFF_LOG.md
files_remaining: none for the draft
blockers: required CI is NOT_MEASURED until the draft PR runs
open_questions: Cheeko approval of the exact disclaimer wording before merge. Reverse link from /guides/advanced-nutrients-feeding-chart-log lands with #2542.
gotchas: Do not set overflow-x hidden on body. Radio labels use min-h-11 (44px). The page does not load its own gtag snippet. CTA href is /auth?mode=signup with data-cta-location tool, article, and footer. No extra query params.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2542
artifacts: src/test/athena-feed-log-rules.test.ts src/test/athena-feed-log-page.test.tsx src/test/athena-feed-log-analytics.test.ts
reviewer_seat: an eligible independent session that did not author this PR
reviewer_sha: NOT_MEASURED
session_state: Cursor Grok cloud agent implementing the public guide; no paused workflow
claimed_by: Cursor Grok cloud agent, 2026-10-26
owner: Cursor Grok cloud agent; on retirement transfer to OG Kush if no successor is named
last_updated: 2026-10-27 10:22 CT, by Cursor Grok cloud agent
```

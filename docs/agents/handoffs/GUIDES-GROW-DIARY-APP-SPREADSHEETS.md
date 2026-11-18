# GUIDES-GROW-DIARY-APP-SPREADSHEETS

```text
TASK GUIDES-GROW-DIARY-APP-SPREADSHEETS  priority: other  status: OPEN
goal: Rewrite /guides/grow-diary-app as an honest comparison (Verdant, Grow with Jane, GrowDiaries, spreadsheets) aimed at "best grow diary app for cannabis", and add /guides/grow-log-without-spreadsheets for "how to log my grow without spreadsheets". Content only.
why: Matthew's AI-search visibility check (2026-11-17) found Verdant absent for those prompts. He approved building both corrected guides into one draft PR (card press relayed 2026-11-18 03:56 UTC).
branch: claude/project-thread-fidqkm
base: verdant-grow-diary at 5719269 (5719269 fix(quick-log): refresh irrigation ledger ... #2997)
pr: #3003 (draft)
state: pushed; draft PR #3003; required ci.yml jobs skip on drafts, so ci.yml is hand-dispatched on the branch; first dispatch failed at knowledge:validate (new public path needed a post-v1 cohort, fixed in the second commit); no independent review yet
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA; (4) Merge Steward queues.
post_merge_check: after live /version.json reports the merge SHA, open /guides/grow-diary-app and /guides/grow-log-without-spreadsheets signed out; expect the new H1s, the FAQ accordion, and /guides/grow-log-without-spreadsheets listed in /sitemap.xml (it redirects to /guides today).
decisions: (1) Every Verdant claim was checked against code at 6cdfd720. Cut as unsupported: live TrolMaster integration (CSV picker says "Coming soon", no ingest), spreadsheet diary import (none exists), care-reminder notifications (Quick Log reminder entry only, nothing sends it), diary sharing (none). EcoWitt stated as read-only on Pro (liveSensors capability). (2) "Needs a connection to save" cut: Matthew has not confirmed it. (3) No publishedOn/modifiedOn on either entry: grow-diary-app is pinned to emit no Article JSON-LD (verdant-seo-guides-render.test.tsx:272) and the publish date is unknown. (4) Competitor links go in `sources` because section links only render for public in-app paths. (5) Five-column comparison reshaped into a two-column columnTable to fit GuideColumnTable.
not_in_scope: homepage and /pricing copy (follow-up list in the PR body); byline "Written by Matthew Cheek" (the guide model has no author field).
tests: verdant-seo-guides.test.ts EXPECTED_SLUGS gains the new slug; verdant-seo-sitemap-robots.test.ts REQUIRED_GUIDE_URLS gains the new URL. Local vitest/typecheck BLOCKED: bun install --frozen-lockfile fails with ProxyConnectFailed (403) on Lovable-registry tarballs; no npm fallback used. A bun-run structural check passed (5 sections each, 9 and 7 FAQs, related slugs resolve, link labels present, 30 unique slugs). Prettier 3.7.3 --check clean.
commands: bunx vitest run src/test/verdant-seo-guides.test.ts src/test/verdant-seo-sitemap-robots.test.ts src/test/verdant-seo-guides-render.test.tsx src/test/verdant-seo-guides-public-links.test.tsx src/test/route-indexation-matrix.test.ts src/test/verdant-guides-glossary-head-invariants.test.ts --reporter=dot ; bun run typecheck
files_touched: src/constants/verdantSeoContent.ts; docs/knowledge-library/post-v1-public-route-cohorts.json; scripts/knowledge/validate-roadmap.test.mjs; public/sitemap.xml; public/llms.txt; docs/seo/route-indexation-matrix.md; src/test/verdant-seo-guides.test.ts; src/test/verdant-seo-sitemap-robots.test.ts; this file
files_remaining: none for this slice
blockers: local checks BLOCKED as above.
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review. Source drafts and change list: /mnt/project-files/guides/ (2026-11-18-*).
claimed_by: Claude thread session for the grow diary guides task, 2026-11-18 04:20 UTC
owner: Claude thread session for the grow diary guides task
last_updated: 2026-11-18 04:12 UTC, by Claude thread session for the grow diary guides task
```

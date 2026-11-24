# HELP-CENTER-SLICE-1-FAQ-WATERING

```text
TASK HELP-CENTER-SLICE-1-FAQ-WATERING  priority: P3  status: OPEN
goal: two help topic pages on top of the #3065 help shell: /help/faq and /help/log-watering, each answer checked against deploy-branch code, plus an exact /faq -> /help/faq redirect.
why: Cheek's help-center slice 1 (brief 2026-11-23). #3065 (Cursor, cursor/help-center-shell-c62a) already owns /help, the nine hubs and the /docs and /support redirects, so this is a stacked follow-up; Cheek said "Build" on 2026-11-24 to building on top of it.
base: cursor/help-center-shell-c62a at 65d1cced5acb3e77ae70bafc4f4a66b7c6116bf5 (PR #3065, not merged). Retarget or rebase onto verdant-grow-diary once #3065 merges; do not merge this before #3065.
branch: claude/project-thread-yj1trk
design: topic pages share the existing /help/$section route (the loader resolves a hub or a topic page via HelpCenterContent.pageBySlug), so no new route file and no routeTree.gen.ts change. Copy lives in src/constants/helpCenterArticleCopy.ts; hubs list their topic pages automatically.
held_claims: none of the five held claims and no AI Doctor promise appear on the topic pages; a test greps the topic-page corpus for credits, credit packs, a-la-carte or extra charges, cancel, kPa, late flower, AI Doctor, control and automat. Device control appears only as "Verdant reads sensor data and never controls your equipment."
sources_checked: QuickLogV2Sheet (Action group Water/Feed/Note, "Choose a tent or plant", Save), AppShell (header "Quick Log", phone "+" "Open Quick Log"), QuickLogWateringForm + quickLogWaterVolumeUnitCopy (ml, L, gal, Volume, "Saves as ... ml" only for L/gal), quickLogWateringFormViewModel (only volume required), quickLogWaterVolumeWarningRules (confirm above 10,000 ml, max 50,000 ml), appRouteManifest (/tools/vpd-calculator public).
not_in_scope: editing #3065's hubs or home copy; billing, credits, AI Doctor, schema, RLS, edge, auth; vercel.json (redirects live in cloudflareHostRoutingRules.ts on this base).
tests: new src/test/help-center-articles.test.tsx; src/test/help-center-routing.test.ts renegotiated: #3065 pinned /faq as not redirected because no FAQ existed; it now 308s to /help/faq.
commands: bunx vitest run src/test/help-center-articles.test.tsx src/test/help-center-routing.test.ts src/test/help-center-page.test.tsx src/test/help-section-unknown-slug.test.ts src/test/route-indexation-matrix.test.ts --reporter=dot ; bun run typecheck ; bun run lint
files_touched: src/constants/helpCenterArticleCopy.ts; src/lib/helpCenterContent.ts; src/pages/HelpCenterPage.tsx; src/routes/help.$section.tsx; src/lib/build/staticPublicSeoDocuments.ts; src/lib/cloudflareHostRoutingRules.ts; src/lib/appRouteManifest.ts (description only); public/sitemap.xml; docs/seo/route-indexation-matrix.md; src/test/help-center-articles.test.tsx; src/test/help-center-routing.test.ts; this file
gotchas: `bun install --frozen-lockfile` 403s on the lovable-core-prod mirror in this cloud box (depd@2.0.0), so local vitest, typecheck, lint and build are BLOCKED; CI is the evidence. Pure-logic checks ran under bun directly (paths, redirects, held-claim guard, unit/limit pins). Do not regenerate bun.lock.
blockers: local test/typecheck/lint/build BLOCKED as above; merge waits on #3065.
reviewer_seat: any eligible session that did not author or repair this change (and did not write #3065's head for the stacked part)
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: Cheek's merge yes after review; order relative to #3065.
claimed_by: Claude thread session (help center slice 1), 2026-11-24 04:45 UTC
owner: Claude thread session (help center slice 1)
last_updated: 2026-11-24 04:45 UTC, by Claude thread session (help center slice 1)
```

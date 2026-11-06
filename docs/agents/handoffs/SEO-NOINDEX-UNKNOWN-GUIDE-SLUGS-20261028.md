# SEO-NOINDEX-UNKNOWN-GUIDE-SLUGS-20261028

```text
TASK SEO-NOINDEX-UNKNOWN-GUIDE-SLUGS-20261028  priority: P2  status: CLOSED
closed: merged. #2597 merged into verdant-grow-diary on 2026-10-29 as a6254b56d52a9ebb2a78dc9192d2c259c4174baf (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Unknown /guides/<slug> never serves "index, follow" (or a canonical to /guides), and the Athena feed log stops linking the unpublished /guides/advanced-nutrients-feeding-chart-log.
why: Ahrefs indexability audit (2026-10-28, Grok Bot's /workspace/seo/audits/2026-10-28-ahrefs-indexability.md; not readable from this session). On base the dead link rendered a 200 "index, follow" page with no canonical that then redirected to /guides on the client.
branch: claude/seo-noindex-unknown-guide-slugs
base: verdant-grow-diary
checkout: git fetch origin claude/seo-noindex-unknown-guide-slugs verdant-grow-diary && git switch claude/seo-noindex-unknown-guide-slugs && git merge origin/verdant-grow-diary
pr: draft; read the PR for the exact head
head_sha: parent of this commit is 8101fa97bc5c87356bb679c0dd886543d85a079c (Cursor Agent test commit on 2b80c76918af614da5cc298494fbad5e3718aa66, the 479cadb base merge); feature commit 80ec001f2e4abc5676b53a662524969ee62553f6. A commit cannot record its own SHA: the reviewed head is this commit, and review must name its full SHA from the PR
state: ready for review. PASS (session_017UoYKwL7nbjQYSesoeniiR) and founder yes were both at 96901cea4e0e92fe3644a33a151a60e30e995939; the merge queue dequeued it on a HANDOFF_LOG.md conflict after #2539 (d55c557) merged, so this block's commit is a base merge that keeps both blocks. Both the PASS and the founder yes are stale at the new head and must be renewed there
current_step: Codex review at 8101fa9 addressed: P1 (GuidePage hydration flipped unknown slugs to index, follow) fixed with noindex: !guide; P2 source-scan route test replaced with a resolved Route.options.head assertion (founder-approved scorer unlock); P2 head_sha precision answered here
next_action: Eligible independent reviewer (OWNERSHIP.md §4.3; Claude excluded as author) reviews at the exact head. #2542 re-adds the Athena related link when it ships.
post_merge_check: Once live /version.json reports the merge SHA, GET https://verdantgrowdiary.com/guides/does-not-exist and confirm one <meta name="robots" content="noindex, follow"> and no rel=canonical; NOT_MEASURED until then.
active_writer: Claude
decisions: noindex, follow instead of a real 404 (keeps the existing client redirect to /guides and its tests); head logic in pure src/lib/guideRouteHeadRules.ts; published guides keep their exact staticRouteHead. Optional csv-preview PR skipped (not trivial on top of the scorer-lock decision).
tried_and_rejected: curl of the built page (blocked by a plugin safety hook) and vite preview (cloudflare-module output cannot run under Node). Verified instead by importing .output/server/index.mjs and calling its fetch handler, as scripts/capture-ssr-head-snapshots-with-server.mjs does.
commands: bunx vitest run src/test/seo-guide-slug-indexability.test.tsx src/test/athena-feed-log-page.test.tsx ; bun run typecheck ; node scripts/scorer-lock.mjs --report --strict
files_touched: src/lib/athenaFeedLogRules.ts; src/pages/AthenaFeedLog.tsx; src/routes/guides.$slug.tsx; src/lib/guideRouteHeadRules.ts (new); src/test/seo-guide-slug-indexability.test.tsx (new); src/test/athena-feed-log-page.test.tsx (renegotiated pin, founder-approved); docs/agents/HANDOFF_LOG.md; src/pages/GuidePage.tsx (noindex while redirecting); src/test/guide-page-unknown-slug-client-head.test.tsx (new); src/test/guideRouteHeadRules.test.ts (added by Cursor Agent in 8101fa9; source scan replaced by Claude, founder-approved unlock)
files_remaining: none
blockers: none for repository work. The 2026-10-28 Actions outage cleared; non-required Dependency & Security CI is red on the base's @hono/node-server advisory until #2605 lands; required ci.yml checks skip while draft.
open_questions: none
gotchas: bun run build refuses a dirty tree (stamp_dirty); a local build rewrites src/routeTree.gen.ts, public/version.json and src/generated/buildInfo.ts, which must be reverted.
links: #2542 (re-adds the link); not folded into #2561 or #2549
reviewer_seat: eligible independent session under OWNERSHIP.md §4.3; excluded: Claude (author) and the Cursor Agent session that pushed 8101fa9
reviewer_sha: none yet
session_state: Claude Code cloud session; no routines
claimed_by: Claude, 2026-10-28 12:05 UTC
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-10-29 16:40 UTC, by Claude (Codex P1/P2 fixes on top of 8101fa9))
```

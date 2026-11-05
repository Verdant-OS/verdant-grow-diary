# CULTIVAR-SLUG-RULES-PURE

```text
TASK CULTIVAR-SLUG-RULES-PURE  priority: other  status: OPEN
goal: Move the Supabase I/O out of src/lib/cultivarSlugRouteRules.ts into src/lib/cultivarSlugRouteService.ts so the rules file is pure (AGENTS.md §5), with /cultivars/$slug behavior unchanged, including the catalog 503 from #2777.
why: cultivarSlugRouteRules.ts was the only root-level *Rules.ts importing @/integrations/supabase/client (added by #2758, changed by #2777). Recorded as drift at af6a416d in docs/architecture-contract.md and as an open follow-up in docs/agents/handoffs/ARCH-CONTRACT-RESTAMP-AF6A416D.md and docs/audits/architecture-contract-collision-audit-2026-11-04.md.
branch: claude/blissful-pasteur-3rt3xi
base: verdant-grow-diary at 7d720e705c969321aa4411e35ca4bd52bfb622b7
checkout: git fetch origin claude/blissful-pasteur-3rt3xi verdant-grow-diary && git switch claude/blissful-pasteur-3rt3xi && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: see the draft PR for head claude/blissful-pasteur-3rt3xi (URL recorded in the PR's resume-here comment)
head_sha: read the PR head; this file is committed in the first push, so it cannot name its own commit
state: pushed draft
current_step: draft PR opened; awaiting required CI and an independent exact-head review
next_action: confirm 35/35 required checks at the PR head, then route an independent reviewer (OWNERSHIP.md §4.3) who did not author or repair this change
post_merge_check: on the live SHA, GET https://verdantgrowdiary.com/cultivars/sour-stomper returns 200 and /cultivars/Sour-Stomper returns 308 to /cultivars/sour-stomper; a failure reopens this task with the same owner. The 503 path is DB-failure-only and is NOT_MEASURED live.
active_writer: Claude session session_017UoYKwNbAomBtM3Ja7L89e
decisions: (1) New CultivarSlugRouteService owns the Supabase read, the cultivarDatabaseReadsEnabled flag check, and the module-level per-request promise cache with its setTimeout clear, moved verbatim. (2) The rules keep fromKnown, notFoundHead, headFor, plus three new pure statics: decideFromCatalog (the 503 fold: missing + failed read -> unavailable), staticKnownSlugs, knownFromSnapshot (the published-profile merge, previously inline in readKnownSlugs). (3) Did not add to cultivarReferenceService.ts: that file is documented as the table-level SELECT layer; the slug cache is route orchestration. (4) docs/architecture-contract.md is not edited: its census rows describe the stamped tree af6a416d and change only at the next restamp. (5) CLAUDE.md is not edited: draft #2882 holds it, and it is a versioned governance file.
tried_and_rejected: none
commands: bun install --frozen-lockfile; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; bun run typecheck:tsgo; bunx vitest run src/test/cultivar-slug-route-status.test.tsx src/test/cultivar-slug-ssr-followup.test.tsx; grep -lE '^\s*import\b.*from\s+"@/integrations/supabase/client"' src/lib/*Rules.ts (expect no output, exit 1)
files_touched: src/lib/cultivarSlugRouteRules.ts; src/lib/cultivarSlugRouteService.ts (new); src/routes/cultivars.$slug.tsx; src/test/cultivar-slug-route-status.test.tsx; src/test/cultivar-slug-ssr-followup.test.tsx; docs/agents/handoffs/CULTIVAR-SLUG-RULES-PURE.md
files_remaining: none in this slice. Follow-ups for other slices: the next architecture-contract restamp can drop the cultivarSlugRouteRules.ts runtime-importer row (§AC-3.2 census, line ~582).
blockers: none
open_questions: none
gotchas: plain `bun run typecheck` hit a V8 heap OOM in this container; NODE_OPTIONS=--max-old-space-size=8192 passes. The moved `let shared` keeps its pre-existing prefer-const lint warning; it was kept byte-identical.
links: #2777 (4b8e38f9), #2758, docs/agents/handoffs/ARCH-CONTRACT-RESTAMP-AF6A416D.md
artifacts: PR checks at the head
reviewer_seat: unassigned; must exclude this authoring session
reviewer_sha: none yet
session_state: no routines, no paused workflows; merge and ready-for-review are not authorized by this task
claimed_by: Claude session session_017UoYKwNbAomBtM3Ja7L89e, 2026-11-05 00:12 CT
owner: Claude (this session)
last_updated: 2026-11-05 00:14 CT, by Claude
```

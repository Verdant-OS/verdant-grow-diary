# DEAD-MODULE-CLEANUP-ZERO-REFERENCE

```text
TASK DEAD-MODULE-CLEANUP-ZERO-REFERENCE  priority: P3  status: CLOSED
closed: merged. #2946 merged into verdant-grow-diary on 2026-11-12 at 09:58 UTC as 4fb9f4389646ba9b468d7aa00384e08b0ec2c700 (final SHA; first-parent commit on origin/verdant-grow-diary whose subject ends (#2946), read 2026-11-12; merge time from GitHub). Closed in bulk by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f on 2026-11-12 at Matthew's request (source claim: his message relayed in that thread's brief). This close does not resolve the post-merge check, open questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261112.md.
goal: Remove the seven source files that nothing imports and nothing names, so readers and agents stop paying for code no screen, script, edge function or test uses.
why: Repository audit 2026-11-11/12 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8. A static import graph over every tracked code file found 273 of 2,418 non-test source files unreachable from any route, server entry, script or edge function; 238 are reached only by tests; 30 have no importer at all. Of those 30, seven have no textual reference in code, config or workflows either. Matthew chose "The 7 clean files" on the decision card.
branch: claude/dead-module-cleanup
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/dead-module-cleanup verdant-grow-diary && git switch claude/dead-module-cleanup
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2946 (draft)
head_sha: code at f00e77e8a36f3cfc314cec0126adace80e423418 (2026-11-12); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: implemented, local checks green, pushed draft
current_step: draft PR open; required CI runs once it is marked ready
next_action: owner decides when to mark ready; then one independent exact-head review
post_merge_check: none on production. Deleted files had no importer, so no bundle or route changes; after live /version.json reports the merge SHA, the signed-out landing and one authenticated page loading is sufficient. NOT_MEASURED until then.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
deleted: src/components/DiaryEntryAuditTrail.tsx (96 lines); src/components/FoundersWall.tsx (87); src/components/genetics/PlantGeneticsTraceLink.tsx (42); src/components/irrigation/PlantIrrigationHistoryLink.tsx (41); src/lib/ai/postGrowReflectionReviewPacketRedactionAudit.ts (1, empty); src/lib/sensorHistoryImportAuditEventBuilders.ts (135); src/lib/verdantGeneticsXlsxImportEvidenceViewModel.ts (120). None is in the edge mirror.
decisions: (1) Only files with zero importers AND zero textual references in src, scripts, e2e, supabase, config, plugins, tools and .github were removed. (2) No cascade: hooks and helpers that only the deleted components used (for example src/hooks/useFoundersWall.ts) are left for a later decision. (3) No test added: there is no behavior to pin; typecheck, lint and build are the gates for a deletion.
behavior_change: none. No route, bundle entry, test, script or edge function referenced these files.
scorer_lock: no tracked scorer modified.
method_limit: the import graph is static (import/export/require/dynamic import with a literal, vi.mock). It cannot see a file loaded by a computed path. No import.meta.glob use exists in the tree.
not_done: 16 unused shadcn UI primitives under src/components/ui (kept as library scaffolding); 7 zero-importer files that a test, workflow or generator names (three legal page stubs, useMockData.ts, auth-middleware.ts, lib/mcp/index.ts, TimelineVideoCard.tsx); the 238 test-only modules, which need per-feature product decisions.
commands: bun run typecheck:tsgo ; bun run lint ; bun run build (clean tree only: prebuild refuses a dirty stamp) ; bunx vitest run <tree-scanning tests>
files_touched: the seven deletions; this file
files_remaining: none for this slice
blockers: none
open_questions: docs/superpowers/plans/irrigation-evidence-ledger-v1.md line 66 names PlantIrrigationHistoryLink as part of a planned slice; the owner chose to delete it anyway, and that plan would recreate it if it is ever built.
gotchas: `bun run build` rewrites public/version.json and src/generated/buildInfo.ts; restore them after a local build. `bun run typecheck` (tsc) needs NODE_OPTIONS=--max-old-space-size=8192 in the authoring container until #2938 lands.
links: none besides the PR
artifacts: none
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: mark ready, review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 02:15 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f (bulk close; previous 2026-11-11 20:15 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8)
```

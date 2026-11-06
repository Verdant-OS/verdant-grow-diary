# ECOWITT-CUSTOM-UPLOAD-INGEST-PATH

```text
TASK ECOWITT-CUSTOM-UPLOAD-INGEST-PATH  priority: other  status: CLOSED
closed: merged. #2849 merged into verdant-grow-diary on 2026-11-04 as 52676d16bb59677e9aed8391b73e5fc8f91cf3b9 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: The EcoWitt custom-upload station card shows only rows the custom-upload planner wrote. Each planned row carries raw_payload.ingest_path = "ecowitt_custom_upload" and raw_payload.claim_id.
why: P3-1 from the exact-head reviews of #2732 at 191af23c75310e239318b996276365c7df9c346e (Seat D fix request, Seat C note). With an active claim, live rows from the older passkey bridge (supabase/functions/ecowitt-ingest) on the same tent rendered under the custom-upload card. Genuinely live, but the card misstated which pathway produced them.
branch: claude/relaxed-fermat-aladcl
base: verdant-grow-diary (started at e3ecc2b2214314526c9149000ac5932351fd82cd, after #2732 merged as af359ce)
checkout: git fetch origin claude/relaxed-fermat-aladcl verdant-grow-diary && git switch claude/relaxed-fermat-aladcl
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2849
head_sha: read the PR head (a commit cannot name its own SHA). Earlier heads: 85577d51f8e5a1e2379fe022824e10871ea4a909, f61c59b492cb3f3288864edc44a7f295a7f32151 (base merge pushed by verdant-ultra-bot), 1c3e4c37d417bc2528c8b4e337bcf1ee50f7fbc0; none independently reviewed.
state: implemented, tests committed, PR out of draft (marked ready on Matthew's instruction, 2026-11-04)
current_step: PR ready for review, gated (touches supabase/functions/_shared); required CI running; Codex bot code review found no issues
next_action: route an independent exact-head review. Exclude Claude session_017UoYKxbtbUu2bCt65XUPv7 (author) and the #2732 contributors (verdant-ultra-bot, Claude session_017UoYKvcvohNxhmW342Lieo).
post_merge_check: after a Publish that includes this and a live custom-upload packet, the station card shows that packet's values; a passkey-bridge reading on the same tent does not appear under it. NOT_MEASURED until the custom-upload Edge route exists (#2751) and is deployed.
active_writer: Claude session_017UoYKxbtbUu2bCt65XUPv7
decisions: Matthew 2026-11-04: rows without the marker are hidden from this card (not shown under a separate label). They stay visible on every other surface. claim_id is stored because claim ids are already owner-readable (column grant in 20261102150000) and stable across rotate; the card filters on ingest_path only. No schema or migration change: commit_ecowitt_custom_upload_ingest stores raw_payload verbatim.
tried_and_rejected: none
commands: bunx vitest run src/test/ecowitt-custom-upload-station-card-ingest-path.test.ts src/test/ecowitt-custom-upload-station-card-testbench-fence.test.ts src/test/ecowitt-custom-upload-station-card-view-model.test.ts; node scripts/sync-edge-shared.mjs --check; NODE_OPTIONS=--max-old-space-size=6144 bun run typecheck
files_touched: docs/agents/handoffs/ECOWITT-CUSTOM-UPLOAD-INGEST-PATH.md (this file, per the 2026-11-04.2 per-task handoff rule); src/lib/ecowittCustomUploadIngestRules.ts; supabase/functions/_shared/ecowittCustomUploadIngestRules.ts (byte copy); src/lib/timelineBoundedRead.ts; src/lib/ecowittCustomUploadStationCardViewModel.ts; src/test/ecowitt-custom-upload-station-card-ingest-path.test.ts (new); src/test/ecowitt-custom-upload-station-card-testbench-fence.test.ts; src/test/ecowitt-custom-upload-station-card-view-model.test.ts
files_remaining: none
blockers: none
open_questions: none
gotchas: sync-edge-shared.mjs mirrors only supabase/functions/_shared/lib; the _shared/ecowittCustomUploadIngestRules.ts copy is a plain byte copy that a test checks. Open #2752 and #2744 edit the same files with different behaviour; merge-tree is clean for both.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2732
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access; no Publish, APPLY, device or Action Queue operation
claimed_by: Claude session_017UoYKxbtbUu2bCt65XUPv7, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 12:35 CT, by Claude)
```

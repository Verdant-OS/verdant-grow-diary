### CHEM-INVENTORY-REPAIR-001-PR-1652

```text
TASK CHEM-INVENTORY-REPAIR-001-PR-1652  priority: P2  status: CLOSED
goal: Repair failing head #1652 with merge-from-base only and no off-limits edits.
branch: codex/pi-status-read-truth-20260923
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin codex/pi-status-read-truth-20260923 verdant-grow-diary && git switch codex/pi-status-read-truth-20260923 && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1652 (merged)
head_sha: fd5ea684cd077585351f0a2ff39ce1dc46936901
state: CLOSED (merged). Last recorded open state: Pushed merge-from-base update. Local focused PASS: 16 passed / 0 failed / 0 skipped. Actual typecheck PASS. New-head hosted failures: Nested static proofs and production isolation; Lockfile policy, dependency audit, typecheck, build, tests.
next_action: None; closed. Production delivery of this change is NOT_MEASURED here.
files: This repair otherwise preserves feature blobs and imports the base; original PR paths: src/hooks/usePiIngestStatus.ts; src/lib/piIngestStatusRules.ts; src/pages/PiIngestStatus.tsx; src/test/pi-ingest-status-read-states.test.tsx
blockers: Current CI is not full acceptance. fast-uri / nested undici repair is locked; any auth, SQL, supabase, Action Queue or device need stops this item. No force/rewrite.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1652; current check links are on that exact head. Supplemental local receipt C:/Users/G8/Downloads/CHEM-REPAIR-1652-2026-09-28-result.json.
reviewer_seat: Blue Dream
claimed_by: Codex, 2026-09-28 18:46 CT
last_updated: 2026-10-13 16:20 CT, by Claude (log maintenance on owner instruction; not a claim). Earlier entry: 2026-09-28 18:46 CT, by Codex
closure: #1652 merged as a695f5dd07c10f0e73c42d74b84cbb30297a3a2d at 2026-09-30 16:45:09 UTC from final head 42deee003214e44ea8934319d2ebfe4f141f3565. Verified on the deploy branch with git merge-base --is-ancestor at 2026-10-13 16:20 CT.
```

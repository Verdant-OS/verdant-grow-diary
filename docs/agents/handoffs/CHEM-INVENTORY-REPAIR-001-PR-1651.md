### CHEM-INVENTORY-REPAIR-001-PR-1651

```text
TASK CHEM-INVENTORY-REPAIR-001-PR-1651  priority: P2  status: CLOSED
goal: Repair failing head #1651 with merge-from-base only and no off-limits edits.
branch: codex/operator-effective-read-truth-20260923
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin codex/operator-effective-read-truth-20260923 verdant-grow-diary && git switch codex/operator-effective-read-truth-20260923 && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1651 (merged)
head_sha: 7f31a8d4eaaf217bab6897fbaacdb7bf0edf48c6
state: CLOSED (merged). Last recorded open state: Normal-pushed 2026-09-29 08:38 UTC from0ca4487f016877b8db872fa9eeba0205e07c433b, clean merge of deploy61821446ebd7e4fb30a36a5a95b7526a34515df5. All eleven feature blobs byte-unchanged. Local7 files155 PASS / 0 FAIL / 0 SKIP, actual installed TypeScript0 diagnostics, scoped lint0 errors/0 warnings, unchanged MCP bundle check/whitespace PASS. Original shim/Bun startup failures retained, direct Node tools pass without install/lockfile edit. Predecessor root fast-uri/nested undici/GA hydration failed logs read; current new-head job109325182441 already FAILS undici GHSA-3wwx-pv8p-q78v, log read. Existing #1751 owns GA hydration fix, fresh10/10 Chromium and WebKit; no duplicate edit. New-head terminal required CI/Blue Dream/live Edge acceptance NOT_MEASURED. Stay draft, auto-merge off, no force/rewrite.
next_action: None; closed. Production delivery of this change is NOT_MEASURED here.
files: This repair otherwise preserves feature blobs and imports the base; original PR paths: scripts/sync-mcp-edge-bundle.mjs; src/hooks/useOperatorAccountReadModels.ts; src/lib/operatorAccountReadModels.ts; src/test/grow-walk-context-read-models.test.ts; src/test/mcp-ecowitt-provenance-fence.test.ts; src/test/mcp-effective-bundle-parity.test.ts; src/test/operator-account-read-models-hook.test.tsx; src/test/operator-account-read-models.test.ts; src/test/operator-effective-sensor-readings.test.ts; src/test/sensor-history-read-cap-backstop-sql.test.ts; supabase/functions/mcp/index.ts
blockers: Current CI is not full acceptance. fast-uri / nested undici repair is locked; any auth, SQL, supabase, Action Queue or device need stops this item. No force/rewrite.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1651; current check links are on that exact head. Supplemental local receipt C:/Users/G8/Downloads/CHEM-REPAIR-1651-2026-09-28-result.json.
reviewer_seat: Blue Dream
claimed_by: Codex, 2026-09-28 18:46 CT
last_updated: 2026-10-13 16:20 CT, by Claude (log maintenance on owner instruction; not a claim). Earlier entry: 2026-09-29 03:38 CT, by Codex
closure: #1651 merged as a8fa40cce4ad562211994633e51b295cda0a562a at 2026-09-29 21:55:03 UTC from final head 474a1f4b15435e7ca570f2c35f5e101af5f7bb0c. Verified on the deploy branch with git merge-base --is-ancestor at 2026-10-13 16:20 CT.
```

# IRRIGATION-LEDGER-REFRESH-ON-SAVE

```text
TASK IRRIGATION-LEDGER-REFRESH-ON-SAVE  priority: P2  status: OPEN
goal: A Water or Feed entry saved from Quick Log shows up in the tent and plant irrigation panels right away, without a page reload.
why: Found in the 2026-11-18 core-loop walk on production (b7e0521, UX Audit Test Tent, signed-in test entries tagged [smoke]). After saving a Water entry, the Timeline showed it but the tent irrigation history stayed stale until reload. Matthew asked (2026-11-18 01:13 UTC, via coordinator relay) for each rough spot found in the walk to get its own focused branch and draft PR with tests, ready for independent review, no merges.
root_cause: useTentIrrigationLedger keys its query ["irrigation","ledger",owner,tent,plant,pageSize]; applyQuickLogV2Refresh never invalidated that prefix, so React Query kept the pre-save ledger.
branch: claude/irrigation-ledger-refresh-on-save
base: verdant-grow-diary at 9e7e51ee
pr: #2997 (draft) https://github.com/Verdant-OS/verdant-grow-diary/pull/2997
state: pushed; draft PR open; required checks running; no independent review yet
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this (exclude cse_017UoYKywjU6h8V7ndDq9JPe); (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, signed in on the disposable test account, open the UX Audit Test Tent, save a Water entry tagged [smoke <timestamp>] from Quick Log, and expect it in the tent irrigation history without reloading.
decisions: (1) Export one prefix constant from the pure irrigationLedgerRules module and use it in both the hook key and the refresh list, so they cannot drift. (2) Invalidate the bare prefix in ALWAYS_KEYS, matching how timeline is handled; it covers tent and plant scopes. Rejected: a scoped key per target, because the hook key carries owner and pageSize the refresh does not know.
behavior_change: after any confirmed Quick Log save, cached irrigation ledger queries are marked stale and refetch when mounted. One extra read per mounted irrigation panel per save. No write path changes; quicklog_save_manual is untouched.
not_in_scope: Timeline unit mixing, Alerts temperature display, VPD mismatch, AI Doctor UTC timestamp; each is its own slice.
tests: new src/test/quick-log-v2-refresh-irrigation-ledger.test.ts (3 tests, real QueryClient, asserts isInvalidated on tent and plant ledger keys). Local RED/GREEN: BLOCKED, see blockers. CI is the evidence for this head.
commands: bunx vitest run src/test/quick-log-v2-refresh-irrigation-ledger.test.ts src/test/quick-log-v2-refresh-rules.test.ts src/test/quick-log-v2-refresh-static-safety.test.ts --reporter=dot ; bun run typecheck
red_proof_recipe: git diff origin/verdant-grow-diary -- src/lib/quickLogV2RefreshRules.ts > x.patch && git apply -R x.patch ; run the new test, expect all 3 to fail ; git apply x.patch
files_touched: src/lib/irrigation/irrigationLedgerRules.ts; src/hooks/useTentIrrigationLedger.ts; src/lib/quickLogV2RefreshRules.ts; src/test/quick-log-v2-refresh-irrigation-ledger.test.ts (new); this file
files_remaining: none for this slice
blockers: local checks BLOCKED. bun install --frozen-lockfile got ProxyConnectFailed (403) on tarballs pinned to the Lovable registry mirror in bun.lock; the partial node_modules cannot start vitest (missing pathe) and has no typescript. No npm fallback was used, per AGENTS.md section 16.
gotchas: quick-log-v2-refresh-static-safety.test.ts scans quickLogV2RefreshRules.ts for React or Supabase imports and for live/synced/connected/imported wording; the new import and comments avoid both.
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decision: Matthew's merge yes after review.
claimed_by: Claude cse_017UoYKywjU6h8V7ndDq9JPe, 2026-11-18 01:21 UTC
owner: Claude cse_017UoYKywjU6h8V7ndDq9JPe
last_updated: 2026-11-18 01:40 UTC, by Claude cse_017UoYKywjU6h8V7ndDq9JPe
```

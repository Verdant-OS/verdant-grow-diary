# CI-FLAKE-GA-PROXY-REA-WAITFOR

```text
TASK CI-FLAKE-GA-PROXY-REA-WAITFOR  priority: P2  status: OPEN
goal: Stop two CI flakes that fail required checks on unrelated PRs: the GA collection proxy "socket hang up" (Full test suite shard 25/32) and the REA cli.test.mjs waitFor empty-read race ("Lint, typecheck, test, build").
why: On 2026-11-04 shard 25 failed on #2832 (twice), #2852 and #2831's merge-queue run; the REA race failed #2855 and #2818. Each failure blocks or ejects a reviewed, otherwise-green PR.
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ (2026-11-04)
branch: claude/ci-flake-ga-proxy-rea-waitfor
root_cause_ga: e2e/utils/googleAnalyticsCollectionHost.ts answered a refused request with 403/400 and then req.destroy(), without Connection: close. Node 22's global agent keeps sockets alive, so the client could send its next request on the destroyed socket -> "socket hang up".
fix_ga: send Connection: close on the refusal and let Node close the socket after the response flushes (no req.destroy()).
root_cause_rea: scripts/rea/tests/cli.test.mjs waitFor() returned the first successful read; fixtures write with writeFile (truncate then write), so it could read "".
fix_rea: poll until the file is non-empty.
tests: new keep-alive regression case in src/test/google-analytics-collection-host-proxy.test.ts (25 refused requests over one keep-alive socket; asserts 403 + Connection: close). RED with the proxy fix set aside 3/3; GREEN 5/5. REA: node --test scripts/rea/tests/*.test.mjs 26/26; rollback test 5/5.
scorer_lock: all three changed files are locked scorers; renegotiation declared in the PR body.
gate: Matthew 2026-11-04 ("yes to all"): Reviewer A / independent reviewer PASS (no P1/P2) at the exact head + 35/35 required.
files_touched: e2e/utils/googleAnalyticsCollectionHost.ts, scripts/rea/tests/cli.test.mjs, src/test/google-analytics-collection-host-proxy.test.ts, docs/agents/handoffs/CI-FLAKE-GA-PROXY-REA-WAITFOR.md
next_action: review at the PR head; merge on PASS + 35/35.
```

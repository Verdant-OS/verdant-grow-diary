# DEPS-PICOMATCH-EXCEPTION

```text
TASK DEPS-PICOMATCH-EXCEPTION  priority: P1  status: OPEN
goal: `bun run check:deps` passes on the deploy branch again, so the dependency audit stops failing the merge queue and unrelated pull requests.
why: #3005 (merged 2026-11-18 06:27 UTC) added a dated exception for picomatch advisory 1247710 (GHSA-fc5q-39xc-vjpf). That advisory no longer appears in `bun audit --json` output, so the exception matches no finding and check:deps fails closed by design ("Reviewed exception for "picomatch" id=1247710 no longer exactly matches a blocked finding."). Observed in merge-queue CI run 44404054738, job 135154426038, and reproduced locally on deploy head 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be. A peer session routed the failure here at Matthew's request.
history: round 1 = #3005 (exception added, merged at a07741450). Round 2 = this change (exception removed).
branch: claude/deps-hono-picomatch-advisories-6nswev (restarted from deploy head 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be after #3005 merged)
base: verdant-grow-diary at 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: draft, opened after the push; the head SHA is recorded on the pull request
state: pushed; draft PR open; required checks running; independent review requested
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: on the deploy branch after merge, `bun run check:deps` prints "OK (5 advisory findings parsed, 0 reviewed blocked findings, 0 unreviewed blocked)". If picomatch 1247710 (or a successor advisory) reappears in `bun audit`, check:deps fails as unreviewed blocked; that needs a new decision, not a silent re-add.
decisions: (1) Remove the exception rather than refresh it: the current audit has no picomatch finding for an exception to match, and the checker treats an empty exceptions array as valid. (2) Both files return byte-for-byte to their state before #3005: config/dependency-security-exceptions.json has "exceptions": [] and the contract pin in src/test/dependency-security-phase-a-contract.test.ts expects [] again. (3) No package.json, override or lockfile change: npm latest picomatch is still 4.0.7, so there is no release to move to, and none is needed.
evidence_audit: `bun audit --json` on base lists 5 findings, all low or moderate: fast-xml-parser (low), glob (moderate), minimatch (moderate), seroval (moderate x2). BLOCKED_SEVERITIES is high and critical, so none blocks. picomatch is absent.
not_in_scope: #2978; #3003; #3004; every other exception, dependency and advisory. The five non-blocking findings are unchanged.
tests: GREEN at this change: `bun run check:deps` -> "check-dependency-security: OK (5 advisory findings parsed, 0 reviewed blocked findings, 0 unreviewed blocked)", exit 0. RED with the old exception restored: exit 1, "Reviewed exception for "picomatch" id=1247710 no longer exactly matches a blocked finding." (same as the merge-queue failure). Contract pin: node evaluation of the committed JSON gives []. Local vitest, typecheck, lint and build are BLOCKED: node_modules is incomplete (vitest cannot resolve 'pathe'; tsc is not installed) because `bun install --frozen-lockfile` 403s on the Lovable registry mirror. No npm fallback, no lockfile regeneration (AGENTS.md section 16). CI is the evidence for this head.
red_proof_recipe: git show a07741450 -- config/dependency-security-exceptions.json | git apply ; bun run check:deps, expect exit 1 on picomatch 1247710 "no longer exactly matches" ; git checkout -- config/dependency-security-exceptions.json
commands: bun run check:deps ; bunx vitest run src/test/dependency-security-phase-a-contract.test.ts --reporter=dot ; node scripts/scorer-lock.mjs --report --strict
files_touched: config/dependency-security-exceptions.json; src/test/dependency-security-phase-a-contract.test.ts; this file
files_remaining: none for this slice
gotchas: The checker fails closed on a stale exception as well as on a new finding, so an advisory that is withdrawn upstream breaks CI exactly like one that is published. A partial node_modules from the failed frozen install is in the session checkout; it is gitignored and not committed.
blockers: local test, typecheck, lint and build BLOCKED as above.
reviewer_seat: requested on the PR under OWNERSHIP.md section 4.3; any eligible session that did not author or repair #3005 or this change
reviewer_sha: none yet
session_state: no routines, no paused workflows. PR activity subscription on the draft PR. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude deps thread session, 2026-11-18 22:00 UTC
owner: Claude deps thread session
last_updated: 2026-11-18 22:00 UTC, by Claude deps thread session
```

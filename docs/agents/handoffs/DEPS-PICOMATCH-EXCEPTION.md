# DEPS-PICOMATCH-EXCEPTION

```text
TASK DEPS-PICOMATCH-EXCEPTION  priority: P2  status: OPEN
goal: `bun run check:deps` passes on the deploy branch again, so dependency-audit failures stop blocking unrelated pull requests (#2978, #3003 and later ones).
why: The only blocking finding left on base is picomatch advisory 1247710 (GHSA-fc5q-39xc-vjpf, ReDoS, every version <=4.0.7). No fixed picomatch release exists, so no version bump or override can clear it. Matthew chose a short-lived, dated exception for that one advisory (2026-11-18, "Add exception", relayed by the coordinator). The hono advisories named in the branch were already fixed on base by #2977.
branch: claude/deps-hono-picomatch-advisories-6nswev
base: verdant-grow-diary at 5719269baec2245b4f3f0a372d57bf0ca1c1a2e1 (#2997)
pr: draft, opened after the first push; the head SHA is recorded on the pull request
state: pushed; draft PR open; required checks running; independent review requested
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: on the deploy branch after merge, `bun run check:deps` prints "OK (... 1 reviewed blocked findings, 0 unreviewed blocked)". On or after 2026-11-25 (recheckOn) it warns; check whether picomatch has shipped a fix. If it has, remove the exception and return the contract pin to []. On 2026-12-09 (expiresOn) the gate fails closed again by design.
decisions: (1) Exactly one exception: picomatch#1247710, severity high, recheckOn 2026-11-25, expiresOn 2026-12-09. Three weeks, so a forgotten exception fails CI rather than living on. (2) Every structural field (lock resolutions, Bun affected keys, parent keys, direct root ancestors) was filled from what check:deps reported as "found", so the exception fails closed on any lockfile drift. (3) allowedImportPaths and allowedScriptNames are empty: no app, script or edge-function code imports picomatch; it is reached only through build, test and dev tooling (Vite and its plugins, Vitest, lint-staged, typescript-eslint, tinyglobby, unplugin, TestDino reporter). Glob patterns come from repository config, never from user input. (4) The contract test pin in src/test/dependency-security-phase-a-contract.test.ts that expected an empty exception list now expects this one exception, including its recheck and expiry dates, so renewing or widening the exception forces a reviewed test change. (5) No package.json override and no lockfile change: there is no fixed version to move to.
not_in_scope: #2978 (its hono failure clears with a merge from base; its owner does that); #3003; #3004; every other exception, dependency and advisory. The non-blocking findings (fast-xml-parser low, glob moderate, minimatch moderate, seroval moderate x2) are unchanged.
tests: `bun run check:deps` -> "OK (6 advisory findings parsed, 1 reviewed blocked findings, 0 unreviewed blocked)". The new pin value was checked by evaluating the same mapping over the committed JSON with node: ["picomatch#1247710:high recheck 2026-11-25 expires 2026-12-09"]. Local vitest, typecheck, lint and build are BLOCKED: `bun install --frozen-lockfile` fails with 403 on the Lovable registry mirror tarballs, so node_modules is incomplete. No npm fallback and no lockfile regeneration, per AGENTS.md section 16. CI is the evidence for this head.
scorer_lock: declared with `node scripts/scorer-lock.mjs --unlock config/dependency-security-exceptions.json src/test/dependency-security-phase-a-contract.test.ts --reason "Cheek chose a dated exception for picomatch 1247710 (no fixed release); the contract pin moves with it"` (valid to 2026-11-19T05:27:39Z). `node scripts/scorer-lock.mjs --report --strict` -> 2 changed scorers, 0 still locked, exit 0. Both renegotiated checks are named in the PR body. A locked scorer needs an outside reviewer (OWNERSHIP.md).
red_proof_recipe: git diff origin/verdant-grow-diary -- config/dependency-security-exceptions.json > x.patch && git apply -R x.patch ; bun run check:deps, expect it to fail on picomatch 1247710 as unreviewed ; run the contract test, expect the pin to fail ; git apply x.patch
commands: bun run check:deps ; bunx vitest run src/test/dependency-security-phase-a-contract.test.ts --reporter=dot ; node scripts/scorer-lock.mjs --report --strict
files_touched: config/dependency-security-exceptions.json; src/test/dependency-security-phase-a-contract.test.ts; this file
files_remaining: none for this slice
gotchas: The expectedNpm* fields are structural only (package-lock.json is retired); they mirror the Bun resolutions so the checker's schema is satisfied. A partial node_modules from the failed frozen install is left in the session checkout; it is gitignored and not committed.
blockers: local checks BLOCKED as above.
reviewer_seat: requested on the PR under OWNERSHIP.md section 4.3; any eligible session that did not author or repair this
reviewer_sha: none yet
session_state: no routines, no paused workflows. PR activity subscription on the draft PR. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude deps thread session, 2026-11-18 05:28 UTC
owner: Claude deps thread session
last_updated: 2026-11-18 05:28 UTC, by Claude deps thread session
```

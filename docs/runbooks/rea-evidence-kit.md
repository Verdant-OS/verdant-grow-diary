# REA evidence kit

This slice implements the shared foundation and job 3 only. It helps QA compare
what a signed-out visitor receives with a source inventory at a named commit.
It does not change the application, its dependencies, importers or deployment.

## Design and implementation record

The implementation uses dependency-free Node scripts and the global REA 6.8.0
CLI over JSON-lines MCP. It owns one fresh Chromium profile and one REA session
per run. Chromium opens the production landing page; REA attaches through a
literal loopback CDP endpoint. Only `inspect_web_page`, `analyze_web_bundle` and
`export_evidence_bundle` are callable through this slice's shared client.

An alternative was attaching to an existing browser profile, which could expose
an unrelated signed-in session. A fresh signed-out profile keeps the input scope
predictable. Directly fetching bundle URLs was also considered; REA's actual
browser tools require CDP, and passive capture preserves the visitor boundary.

The source denominator comes from `FileRoutesByFullPath` in the committed
`src/routeTree.gen.ts`, read with `git show`, rather than from the working tree.
Source-module paths come from that commit's tracked product code. Neither list
causes browser navigation. Source inventories are comparison inputs and do not
prove which commit is deployed.

Implementation plan and checkpoints:

- [x] Audit local ownership, relevant PRs, tool availability and allowed files.
- [x] Verify REA 6.8.0 schemas and evidence retention using an isolated fixture.
- [x] Add tests for redaction, exact-commit reads, unknowns and the MCP boundary.
- [x] Implement source inventory, passive browser capture, reporting and cleanup.
- [x] Run a production bundle map, inspect its evidence and record measured counts.
- [x] Compare available before/after checks and complete a fresh peer code review.
- [ ] Complete the app suite after the locked dependency installation succeeds.

Allowed files are `scripts/rea/`, this runbook and `.gitignore`. App source,
Supabase, migrations, Workers settings, CI, billing and parked sensor work stay
outside this slice. Handoff details for this tooling belong here and in its
draft PR rather than expanding the file allowlist into governance documents.

## Shared foundation

Prerequisites:

- Node for the scripts, Git, and a Chromium executable.
- Global `rea-agents@6.8.0` running on a supported Node version. The published
  runtime range is `^22.23.4 || ^24.22.1 || >=26.12.1`; verify with
  `rea --version --format json`. The kit requires `supported_runtime.satisfied`
  to be true. REA is not an application dependency.
- Normal browser access to `https://verdantgrowdiary.com/`. A configured
  `HTTPS_PROXY`/`HTTP_PROXY` is passed to Chromium. TLS verification stays on.

The kit makes local HTTP requests only for its owned loopback CDP target list.
External traffic comes from the normal public page load. It does not probe
endpoint candidates, fetch source maps, inspect hidden app state, log in, submit
forms, visit admin pages, invoke page-declared tools, or call Supabase directly.

Each successful run writes into `rea-out/bundle-map/<ISO-timestamp>/`:

- `report.md`: target, reference SHA, REA version, capture time in CT and UTC,
  observed candidates/chunks, source comparison, limits and a final `Verified:` line.
- `inventory.json`: the same metadata and structured comparison results.
- `evidence-bundle.json`: the unmodified canonical export from REA.

Directories are private and report files use owner-only permissions on POSIX.
CT uses `America/Chicago`, including daylight saving time. The directory uses
basic ISO 8601 UTC form, for example `20261030T010000.000Z`.

Privacy: inspection disables accessibility/console text, JSON/WebSocket shapes,
storage keys/fingerprints and script-source output. Bundle analysis processes
script sources in memory but successful Evidence retains analysis metadata,
not the script bodies. Both records must have `raw_result: null` and pass the
credential/URL scan in memory before export. A failed or unsafe session is
discarded without exporting it: REA failure evidence can retain source text.
The kit does not rewrite canonical Evidence, because doing so would invalidate
its authenticated identities. Report projections have a separate redactor.
Keyword occurrences such as `/reset-password` or a redacted header name are not
the same as an exposed credential value. The scan is a bounded safeguard, not a
proof that every possible opaque string is harmless.

Analysis budgets are 120 seconds per script, 300 seconds total, and a 420-second
MCP request deadline. Timeouts remain explicit unknowns. Those limits do not
change the browser observation window or make the application inventory complete.

Tests, without installing app dependencies:

```bash
node --test scripts/rea/tests/*.test.mjs
```

## Job 3 — Live bundle map

Run before investigating missing routes or unexpected deployed JavaScript,
and after a release when QA needs a public-surface inventory. The consumer is
the currently assigned QA/reviewer session under repository ownership rules;
the original proposal's Blue Dream seat is retired.

From the repository root, choose an exact locally available commit:

```bash
node scripts/rea/bundle-map.mjs --commit "$(git rev-parse HEAD)"
```

Optional executable paths:

```bash
node scripts/rea/bundle-map.mjs --commit "$(git rev-parse HEAD)" \
  --rea /absolute/path/to/rea --chrome /absolute/path/to/chromium
```

Containers that cannot provide the Chromium sandbox may explicitly add
`--no-sandbox`. The normal command keeps the sandbox enabled. The command opens
only the production landing page in its own fresh profile and deletes the
profile after capture. It never attaches to an existing user browser.

A pass means the command exits zero, both passive operations succeed, and the
three output files contain the measured subset with their limits. Partial
analysis is allowed only when printed as `NOT_MEASURED`; it is not full coverage.
Missing REA, an unsupported runtime, an invalid/missing commit, unsafe evidence
or failed acquisition must exit nonzero without an evidence export.

Interpretation:

- An exact source-path match means a **static candidate was observed**. It does
  not prove the route works or is accessible to a given user.
- A captured candidate missing from the source list is flagged **REVIEW**. It
  might be a relative path, system route, unsupported syntax or a version mismatch;
  the kit does not assert accidental shipment.
- A source route absent from the capture is **NOT_MEASURED**. Lazy loading,
  conditional code and REA detector coverage can all explain the absence.
- REA's application-route coverage is unknown even when all captured scripts
  parse. A zero candidate count does not establish that the app has zero routes.
- Captured chunks have asset URLs, digests and byte counts. They do not establish
  original source-module identities. Module inclusion/exclusion and deployed
  commit binding stay **NOT_MEASURED** until trustworthy mapping evidence exists.

Review focus: lazy and dynamic routes; zero-script or failed captures; a changed
target URL; secrets in otherwise successful Evidence; and process interruption
while a capture/export is in progress. Tests must exercise observable outputs
and refusals, without modifying app tests or expected pins.

## Deferred jobs

Jobs 1 (release diff), 2 (new-grower scenario), 4 (competitor inventory) and 5
(static APK format report) are not implemented by this slice. No QA credentials,
APK files or vendor-server access are needed. Their permissions and validation
requirements must be implemented with their respective jobs.

## Validation and handoff

Base: `0792349d57de2c1c0e2610f643920cf595486dfc` on `verdant-grow-diary`.
Branch: `codex/rea-foundation-bundle-map-20261029`.
Owner: this Codex implementation session. No merge or deployment is authorized.

Measured in this cloud environment on October 29, 2026 (CT):

| Check | Before | After |
| --- | --- | --- |
| REA tooling tests | Not present | 21 passed, 0 failed |
| Static client-secret scanner self-tests | 29 passed, 0 failed | 29 passed, 0 failed |
| Static client-secret repository scan | PASS | PASS |
| Docs safety | 3 scanners passed | 3 scanners passed |
| App static-safety suite | BLOCKED: 8 suite-load errors, 0 tests executed | BLOCKED: same 8 suite-load errors, 0 tests executed |
| Full app suite | BLOCKED; incomplete | BLOCKED; incomplete |

Exact commands (Bun 1.3.14 was provisioned outside the repository):

```bash
node --test scripts/rea/tests/*.test.mjs
node scripts/security/test-static-client-secret-scan.mjs
node scripts/security/static-client-secret-scan.mjs
node scripts/assert-docs-safety.mjs
bun run test:static-safety --maxWorkers=2 --reporter=json --outputFile=/tmp/rea-static-safety.json
bun run test --maxWorkers=2 --reporter=json --outputFile=/tmp/rea-full.json
```

Dependency blocker: `bun install --frozen-lockfile` exited 1 with HTTP 400
download failures. The partial locked tree lacks `ansi-regex`, which prevents
shared Vitest setup from loading. No alternate dependency tree or lockfile edit
was used. The full baseline was stopped with SIGTERM after confirming that
blocker; the after attempt was bounded with `timeout --signal=TERM 15s` and
also stopped before producing complete counts. There is no full-suite pass or
full before/after count comparison. Local logs are under
`/tmp/verdant-rea-validation/`, including `before-summary.json`.

Two successful production runs:

- `rea-out/bundle-map/20261030T004522.189Z/`: initial 30-second per-script budget.
- `rea-out/bundle-map/20261030T004852.204Z/`: final 120-second per-script budget.

Both captured 81 JavaScript chunks and compared with 147 source routes. REA
returned 0 static route candidates and parsed 80 scripts; one script exceeded
its per-script deadline in both runs. Thus route coverage/comparison remains
**NOT_MEASURED**, rather than asserting that any of the 147 routes is missing.
The final report preserves 15 explicit unknown entries, including capture limits
and unsupported navigation expressions. Source-module identities and production
commit attribution also remain **NOT_MEASURED**. The source list contains 2,334
reference product-code paths, which are not identified with deployed chunks.

The final unmodified evidence export contains two preflight-checked records;
its SHA-256 is
`289a433163dd6d89142a39e8c50d96c2fe0a4e818f2f165fda4076e245387d96`.
These local captures do not establish that production runs this tooling branch.
No production writes, app/source changes, dependency changes or tracked APKs
were introduced.

Peer review found relative/WebSocket credential scanning, descendant-process
cleanup and malformed-proxy cleanup issues. They were fixed; regressions cover
the credential and process cases, plus interruptions during startup, capture,
export and shutdown. This peer review is not repository independent acceptance
or merge approval. The PR stays draft pending those gates and the blocked app checks.

Resume with a supported global REA runtime, then repeat the command in job 3.
Further route extraction needs REA support for the timed-out/unsupported code;
do not infer missing routes or change application bundling inside this scope.
Restore the locked app dependency installation to complete the app-suite check.
Rollback is removal of these scripts/runbook and the REA-specific ignore entries;
the application has no runtime dependency on them.

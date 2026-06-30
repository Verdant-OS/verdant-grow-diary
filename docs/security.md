# Verdant Security Notes

This file collects narrow, build-time security guards that protect the Verdant
client from leaking server-only credentials or unsafe automation surfaces.
For broader auth posture see [`auth-security.md`](./auth-security.md).

## Client Secret Boundary Guard

**Purpose.** Prevent browser/client executable code from referencing
server-only Supabase credentials. The guard fails the build if it finds
`service_role` or `SUPABASE_SERVICE_ROLE_KEY` used as an identifier or
property in code that ships to the browser.

**Why it matters.** `service_role` bypasses Row-Level Security. A single
client-side reference — even one that never reads the real value at
runtime — is a stop-ship leak surface. Verdant treats this as a
boundary, not a lint preference.

### Scanned paths

The guard scans these client-product roots:

- `src/components`
- `src/pages`
- `src/hooks`
- `src/lib`

Edge Functions, server scripts, tests, and migrations are intentionally
out of scope — they may legitimately reference `service_role`.

### What it blocks

After stripping comments, string literals, template literals, and regex
literals from each file, the guard fails on any remaining occurrence of:

- `SUPABASE_SERVICE_ROLE_KEY`
- `service_role`

This means actual identifier usage (e.g. `process.env.SUPABASE_SERVICE_ROLE_KEY`
or `supabase.auth.service_role`) is **blocked**.

### What it intentionally allows

- **Comments** that name the forbidden symbols (for documentation).
- **String literals** that name the symbols (e.g. denylist arrays,
  redaction patterns) — they need the literal to do their job.
- **Regex literals** that match the symbols.
- **Exact-path exceptions** via `EXACT_PATH_EXCEPTIONS` in the guard.
  The set is currently **empty** and is intentionally narrow.
  **No broad allowlists.**

See `scripts/assert-client-secret-boundary.mjs` for the exact rules.

### Run locally

```bash
bun run test:client-secret-boundary
```

A clean pass prints:

```
Client secret boundary OK.
```

### Verify remote CI

The guard is wired into two workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/docs-safety.yml`

Both also upload a short non-secret proof artifact
(`client-secret-boundary-proof-ci` and
`client-secret-boundary-proof-docs-safety`) **only after** the guard
step succeeds — so the artifact's existence is trusted evidence of a
green guard run.

To verify the most recent runs on a branch (requires `gh` CLI
authenticated against `Verdant-OS/verdant-grow-diary`):

```bash
bun run check:client-secret-boundary-ci
```

Optional flags:

```bash
bun run check:client-secret-boundary-ci -- \
  --repo=Verdant-OS/verdant-grow-diary \
  --branch=verdant-grow-diary \
  --limit=1
```

The verifier prints a short sanitized summary per workflow and exits
nonzero unless both workflows are `completed` + `success` + the guard
markers are present in the run logs. It **never** prints raw logs,
env, tokens, or secrets.

### Download and validate the proof artifacts

To independently verify the trusted proof artifacts uploaded by CI
(without opening or pasting raw logs):

```bash
bun run check:client-secret-boundary-artifacts
```

The verifier:

1. Finds the latest `success` runs of `ci.yml` and `docs-safety.yml`
   on the branch (defaults to `verdant-grow-diary`).
2. Downloads the two proof artifacts:
   - `client-secret-boundary-proof-ci`
   - `client-secret-boundary-proof-docs-safety`
3. Validates that each proof text file contains the fixed markers:
   - `Client secret boundary guard: PASS`
   - `Command: bun run test:client-secret-boundary`
   - `Scanned client roots: src/components, src/pages, src/hooks, src/lib`
   - `Blocked executable-code terms: SUPABASE_SERVICE_ROLE_KEY, service_role`
   - `Secrets printed: no`
   - `Raw logs uploaded: no`
4. Rejects any proof file that contains contamination:
   - JWT-shaped tokens (`eyJ…`)
   - `Bearer <token>` headers
   - Assignments like `service_role=…` or `SUPABASE_SERVICE_ROLE_KEY=…`
   - Bridge secret column names: `secret_ciphertext`, `secret_nonce`,
     `secret_hash`, `token_hash`
   - Raw GitHub Actions log fragments (ISO timestamps, `##[group]`
     markers, `::add-mask::`, `env |` dumps)

Optional flags:

```bash
bun run check:client-secret-boundary-artifacts -- \
  --repo=Verdant-OS/verdant-grow-diary \
  --branch=verdant-grow-diary \
  --ci-run-id=<RUN_ID> \
  --docs-run-id=<RUN_ID> \
  --out-dir=artifacts/client-secret-boundary-proof-check
```

The verifier prints **only** a short sanitized per-artifact summary
(workflow, run id, artifact name, marker/contamination counts,
PASS/FAIL). It never prints the proof body, raw logs, env, or
secrets. Exit code is `0` only when both artifacts are present,
downloaded, and valid.

#### Manual fallback

If `gh` is not available locally, an operator can fetch the same
artifacts by hand and inspect them with a plain text viewer:

```bash
gh run list --workflow ci.yml --branch verdant-grow-diary --limit 5
gh run download <RUN_ID> --name client-secret-boundary-proof-ci \
  --dir artifacts/client-secret-boundary-proof-check/ci
gh run download <RUN_ID> --name client-secret-boundary-proof-docs-safety \
  --dir artifacts/client-secret-boundary-proof-check/docs-safety
```

#### What a valid proof artifact contains

A single short text file with the six fixed markers listed above and
nothing else of substance. It is a **claim that the guard ran and
passed**, not a dump of build output.

#### What must never appear in a proof artifact

- Secrets, tokens, JWTs, Bearer headers, bridge tokens, API keys.
- Raw CI logs, log timestamps, `##[group]` markers, `::add-mask::`,
  `env |` dumps.
- Bridge token column names (`secret_ciphertext`, `secret_nonce`,
  `secret_hash`, `token_hash`).
- Any user, sensor, or payload data.

#### Reminders

- **Do not paste secrets** into chat, issues, commits, or artifact
  bodies — even redacted-looking ones.
- **Do not paste raw logs.** The trusted proof artifact is the
  intended evidence surface; raw logs are not.
- A passing artifact proves the guard ran and passed for that run.
  It does **not** prove every future branch or change is safe — the
  guard runs every CI/docs-safety pipeline and must stay enabled.


### What a failure means

If the guard fails on your PR:

1. **Do not paste the failing line or any secret value into chat,
   issue, or commit message.**
2. Remove the client-side reference to `service_role` or
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Move any service-role work to server-only paths — Edge Functions,
   server scripts, or admin tooling — never to `src/components`,
   `src/pages`, `src/hooks`, or `src/lib`.
4. For client UI that needs to surface bridge/token state, keep it
   **metadata-only**: never select or render hashes, ciphertext, or
   raw secret columns.

The guard is a stop-ship boundary. Do not weaken it, broaden its
allowlist, or add `continue-on-error` to its CI step.

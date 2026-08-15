# Dispatcher security review

**Slice:** `VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE`  
**Reviewed:** 2026-08-15  
**Reviewer:** Grok, with an independent `security-review` pass on branch changes  
**Reuse verdict:** do not reuse this dispatcher in the Grow OS or any later automation until the remaining `NOT_MEASURED` live-path checks are closed and Cheek re-approves.

This review is limited to the nested spike, the root production-isolation fence, the root `test:cursor-sdk-local-orchestration` script, and `.github/workflows/cursor-sdk-local-orchestration.yml`.

`POSTGRES_RESTRICTED_ROLE_SPIKE` was not reviewed and was not modified.

## Scope and method

| Item | Status |
| ---- | ------ |
| Host policy, receipt, sanitizer, coordinator, fake adapter | reviewed against source |
| Live `Agent.create` path | code-reviewed only |
| Authorized live SDK run | `BLOCKED` — `CURSOR_API_KEY` absent in this environment |
| Production UI / schema / billing / sensors / AI Doctor / Action Queue | `NOT_APPLICABLE` |
| Postgres restricted-role harness | `NOT_APPLICABLE` — separate track |

Claims below are labeled `established fact`, `practical observation`, `inference`, or `missing evidence`.

## Checklist

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `CURSOR_API_KEY` never logged, written, or committed | `PASS` | `established fact`: key is read from `process.env` only; workflow has no `secrets.` and no `CURSOR_API_KEY`; receipt forbidden names include `key`, `apiKey`, `CURSOR_API_KEY`; gate tests assert the placeholder key does not appear on stdout/stderr |
| Cwd jail and synthetic-fixture-only workspace | `PASS` (host) / `NOT_MEASURED` (live SDK) | `established fact`: `assertTemporarySyntheticCwd` requires `os.tmpdir()`, synthetic marker, and non-production path. `missing evidence`: live sandbox containment was not exercised |
| Read-only tool policy | `PASS` (host) / `NOT_MEASURED` (live SDK) | `established fact`: `tools: ["read"]` plus deny-wins `disallowedTools` including `write`. `missing evidence`: live SDK honoring that policy |
| Receipt sanitization | `PASS` | `established fact`: identifiers are hashed; forbidden field names are rejected; secret-shaped patterns fail `assertReceiptSafe` |
| `liveProofStatus` meaning | `PASS` after this review | `established fact`: `PASS` now requires live adapter + host `HOLD` + cleanup `PASS` + both agents `finished`. A fake adapter with `liveProof: true` records `FAIL` |
| `invalidPresentedAsHealthy` | `PASS` after this review | `established fact`: detected on raw inspector output before sanitization; sanitizer still remaps the published finding; receipt records the raw lie and host verdict becomes `REJECT` |
| Production isolation | `PASS` | `established fact`: `@cursor/sdk` is nested-only; fence scans root manifests and production trees; workflow is static |
| CI never calls the Cursor API | `PASS` | `established fact`: no `proof:manual`, no secrets, `contents: read` |
| Live proof dual gate | `PASS` (code) | `established fact`: missing key exits 2; missing `--authorize-live-proof` exits 2 before the live adapter import. Full live run remains `NOT_MEASURED` |
| Cloud / MCP / custom tools / hooks / auto-PR | `PASS` (host pre-create) | `established fact`: `validatePolicy` rejects those keys before `Agent.create` |
| Invalid/demo never labeled healthy in published findings | `PASS` | `established fact`: sanitizer remaps `healthy` on `*invalid*` / `*demo*` filenames |
| Live tool-call audit trail | `NOT_MEASURED` | `missing evidence`: live stream collector swallows errors and races `wait()` by 500ms |

## Findings

### Closed in this follow-up

1. **Medium, closed.** `liveProofStatus` was `"PASS"` whenever `config.liveProof === true`, including failed or fake-adapter runs. It now uses `resolveLiveProofStatus`.
2. **Medium, closed.** `invalidPresentedAsHealthy` was hardcoded `false` after sanitization made the host adjudicator's check dead. The raw inspector claim is now recorded, and the host rejects.

### Still open

3. **Medium, open.** Live safety still depends on `@cursor/sdk` honoring `tools`, `disallowedTools`, and sandbox cwd. There is no authorized live proof in this environment. Treat SDK enforcement as an unverified dependency.

## Reuse gate

Do **not** propose mounting this dispatcher in `src/`, Edge Functions, CI deploy jobs, or cloud agents.

Required before any reuse proposal:

- Authorized local live proof: `CURSOR_API_KEY` in the process environment plus `--authorize-live-proof`, synthetic fixtures only
- Live canary reads, mutation attempts, and tool-call assertions
- A later Cheek decision

Receipt schema is now `cursor-sdk-local-orchestration-receipt/1.1.0`.

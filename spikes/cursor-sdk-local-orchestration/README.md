# Cursor SDK local orchestration spike

Disposable host-owned proof that two bounded **local** Cursor agents can inspect
and independently review **synthetic** fixtures. This is not production Grow OS
code. It does not replace, pause, or depend on `POSTGRES_RESTRICTED_ROLE_SPIKE`.

## Why this is isolated

Cursor “local” mode keeps the agent loop and filesystem access on the host, but
**model inference still goes to Cursor-hosted models**. Therefore this spike
never sends Verdant source, grower data, credentials, sensor payloads, billing
data, or production prompts.

The SDK lives only in this nested package. The root application must not depend
on `@cursor/sdk`.

## Run static proofs

From the repository root:

```bash
bun run test:cursor-sdk-local-orchestration
```

Or inside this directory:

```bash
bun install --frozen-lockfile
bun run validate
```

CI runs those checks plus the production-isolation fence and `bun audit`.
CI never receives `CURSOR_API_KEY` and never calls the Cursor API.

## Manual live proof (optional, separately authorized)

Requires Node.js 22.13+, a `CURSOR_API_KEY` in the process environment (never
written to disk), and an explicit flag:

```bash
CURSOR_API_KEY=… bun run proof:manual -- --authorize-live-proof
```

Missing key:

```text
SDK LIVE PROOF: BLOCKED — CURSOR_API_KEY NOT PROVIDED
```

Passing fake-adapter tests is not a live SDK pass. `liveProofStatus: PASS`
requires the live adapter, both finished runs, host `HOLD`, and cleanup
`PASS`.

Dispatcher security review:
`docs/dispatcher-security-review.md`. Do not reuse this dispatcher in the
Grow OS until that review's remaining live-path items are measured.

## Policy baseline

- `Agent.create()` local only
- `tools: ["read"]`
- `disallowedTools` includes `shell`, `edit`, `write`, `task`, `mcp`, `webSearch`, plus other mutators from the installed `ToolName` union
- `mode: "plan"`
- sandbox enabled, `dirs: []`, `settingSources: []`, `autoReview: false`
- `enableAgentRetries: false` (host owns one classified transient retry)
- `JsonlLocalAgentStore` only under `os.tmpdir()`
- fixed model `composer-2.5` — no Router / auto-smart fallback
- exactly two baseline sends (Inspector, Reviewer)

## Out of scope

UI, Supabase, schema/RLS, Edge Functions, billing enforcement, sensors,
AI Doctor, Action Queue, device control, auto-fix, auto-commit, auto-PR,
cloud agents, persistent conversations, production deployment.

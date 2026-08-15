# VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE

**Status:** isolated architecture experiment  
**SDK:** `@cursor/sdk@1.0.28` (nested package only)  
**Does not replace or delay:** `POSTGRES_RESTRICTED_ROLE_SPIKE`

Nested `package.json` overrides the `@connectrpc/connect-node` transitive
`undici` to `6.28.0` so `bun audit` is clean. That override is spike-local
and must not be copied into the root application.


## 1. Goal

Prove that a Verdant-owned dispatcher can coordinate two bounded Cursor agents
over synthetic fixtures while enforcing:

- Local agent runtime only
- Synthetic data only
- Read-only agent access
- No production checkout access
- No cloud agents
- No shell, writes, MCP, custom tools, network tools, or subagents
- Explicit model selection
- Bounded run count and timeout
- Sanitized evidence receipts
- Reliable cancellation and cleanup

## 2. Privacy fact

Cursor “local” mode keeps the agent loop and filesystem access local. Model
inference still goes to Cursor-hosted models. This spike must never send real
Verdant source, grower data, credentials, sensor payloads, billing data, or
production prompts.

## 3. Dispatcher architecture

```text
Synthetic fixture builder
        ↓
Fail-closed policy validator
        ↓
Inspector agent (fresh Agent.create)
        ↓
Schema validation and sanitization
        ↓
Independent reviewer agent (fresh Agent.create)
        ↓
Host-side adjudicator
        ↓
Redacted proof receipt
        ↓
Agent disposal and fixture cleanup
```

The Inspector and Reviewer are separate, fresh agents. The host does not use
the SDK `task` tool or agent-defined subagents.

The deterministic host — not an agent — validates configuration before
`Agent.create()`, validates both outputs, sorts evidence, enforces run count /
timeout / retry rules, redacts identifiers, compares fixture hashes, generates
the verdict, disposes agents, and removes temporary state.

## 4. SDK policy

Inspected `ToolName` from `@cursor/sdk@1.0.28` `options.d.ts`:

`shell | read | edit | grep | glob | ls | task | mcp | webSearch | delete |
readLints | webFetch | semSearch | updateTodos | readTodos | askQuestion |
await | generateImage | applyAgentDiff | (string & {})`

`"write"` is not a curated `ToolName` literal. It is a vendor tool-call type
and remains in `disallowedTools` because `ToolName` includes `(string & {})`.
If live `Agent.create()` rejects the unknown name, the live proof is `BLOCKED`
without dropping the restriction.

Read-only is enforceable: `tools: ["read"]` plus deny-wins `disallowedTools`.
Omitting `mcp` disables MCP; disallowing `task` prevents subagents.

Baseline:

- `model: { id: "composer-2.5" }` — no Router / auto-smart fallback
- `local.cwd` = disposable synthetic temp directory
- `local.dirs: []`
- `local.settingSources: []`
- `local.sandboxOptions.enabled: true`
- `local.autoReview: false`
- `local.enableAgentRetries: false`
- `local.store` = `JsonlLocalAgentStore` in `os.tmpdir()`
- `tools: ["read"]`
- `mode: "plan"`

Forbidden SDK surfaces: `cloud`, `cloud.repos`, `cloud.envVars`,
`autoCreatePR`, `workOnCurrentBranch`, `Cursor.auth.login()`, `Agent.resume()`,
inline MCP, custom tools, command-executing hooks, service-account credentials,
production worktrees.

## 5. Inspector / reviewer contracts

Inspector returns JSON `{ schemaVersion, synthetic: true, findings[] }` with
finding ID, source file, evidence, confidence, classification, missing
information, and recommended human review.

Reviewer independently reads the same named files and returns
`{ schemaVersion, synthetic: true, adjudications[] }` with confirmed /
rejected / needs_more_evidence / safety_concern plus rationale.

Host sanitizes, sorts, and remaps invalid/demo classifications that were
wrongly marked healthy.

## 6. Synthetic fixtures

Templates live under `fixtures/synthetic-repository/` and are copied into
`os.tmpdir()` per run. Every file is labeled SYNTHETIC. An external canary is
created outside the permitted cwd and must be unreadable. An immutable hash
anchor must remain byte-identical.

## 7. Usage control

Baseline: exactly two sends. Strict wall-clock timeout. At most one classified
transient retry (`NetworkError` / `RateLimitError` with `isRetryable`).

The SDK exposes post-run usage, not a guaranteed pre-run token ceiling.
Pre-run spend control is therefore `BLOCKED`. The host records post-run token
counts, enforces a maximum run count, and skips the reviewer if the inspector
exceeds the configured post-run budget.

## 8. Live proof

Optional and separately authorized. Absence of `CURSOR_API_KEY` prints:

```text
SDK LIVE PROOF: BLOCKED — CURSOR_API_KEY NOT PROVIDED
```

CI never calls the Cursor API. Fake-adapter green is not a live SDK pass.

## 9. Acceptance

`PROCEED` only when static proofs, production isolation, read-only policy,
cleanup, and both synthetic agent runs pass, and a sanitized live receipt
exists.

`HOLD` when static proofs pass but the manual SDK proof, cleanup proof, model
availability, or usage evidence is incomplete.

`REJECT` on production file access, mutation, shell/MCP, cloud fallback,
secret exposure, unbounded retries, hidden persistent state, or a root SDK
dependency.

## 10. Next gate

1. Land this isolated spike behind the production-isolation fence.
2. Keep `POSTGRES_RESTRICTED_ROLE_SPIKE` on its own track.
3. Optional authorized live proof with `CURSOR_API_KEY` in a local shell only.
4. Security review before any later proposal to reuse the dispatcher.

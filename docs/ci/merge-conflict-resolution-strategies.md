# Merge conflict resolution strategies

Supports **three-ref ownership proof** (base / head / merge) for Full Vitest residuals
and any PR that needs a deterministic local merge when GitHub’s merge ref is missing.

## Tools

| Script | Role |
| --- | --- |
| [`scripts/ci/merge-conflict-resolution-strategies.mjs`](../../scripts/ci/merge-conflict-resolution-strategies.mjs) | Path → strategy policy |
| [`scripts/ci/construct-pr-merge-ref.mjs`](../../scripts/ci/construct-pr-merge-ref.mjs) | Fetch or construct MERGE SHA |

```bash
# Prefer GitHub merge commit (best for Codex ref C)
node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --json

# Local merge + auto strategies (when pull/*/merge unavailable)
node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --apply --worktree /tmp/pr-694-merge --json
```

## Strategy catalog

| ID | Meaning | Auto? |
| --- | --- | --- |
| **ours** | Keep **base** (first parent) | yes |
| **theirs** | Keep **head** (PR branch) | yes |
| **head_contract** | Head wins for SSR/auth/test-harness/build-resolver paths | yes |
| **base_lockfile** | Base wins for lockfiles | yes |
| **union** | Append-only combine | no |
| **regenerate** | Drop both; regenerate (`routeTree.gen.ts`, stamps) | no |
| **manual** | Semantic edit required | no |

### Path policy (first match wins)

1. Lockfiles → `base_lockfile`  
2. Generated / version stamps → `regenerate`  
3. SSR contract + PR harness paths → `head_contract`  
4. Governance (`AGENTS.md`, …) → `manual`  
5. Source `*.ts(x)` / config → `manual`  
6. Markdown docs → `theirs`  

SSR contract paths (head wins):

- `src/integrations/supabase/client.ts`, `client.server.ts`  
- `src/lib/supabaseAuthRuntime.ts`, `supabaseInitializationError.ts`, `ssrErrorResponse.ts`, `error-page.ts`  
- `src/server.ts`  
- Vitest harness / SSR tests under `src/test/`  
- `scripts/resolve-ssr-server-bundle.mjs`, `vitest.config.ts`  

## Resolution procedure

```text
1. Freeze BASE_SHA, HEAD_SHA (gh pr view)
2. Try origin pull/<n>/merge  →  if OK, MERGE_SHA = that tip (stop)
3. Else worktree at BASE, git merge HEAD
4. For each conflicted path: selectStrategy(path)
5. Apply auto (git checkout --ours|--theirs + git add)
6. List remaining → manual | regenerate
7. Only when conflict-free: commit merge → local MERGE_SHA
8. Run three-ref Vitest against BASE, HEAD, MERGE
```

## Ownership implication

| Merge construction | Risk | Vitest interpretation |
| --- | --- | --- |
| GitHub merge ref clean | low | Failures on MERGE are real merge-interaction candidates |
| Local clean merge | low | Same |
| Auto-resolved only | medium | Re-run tests; note auto paths in proof JSON |
| Manual remaining | high | MERGE **unproven** — label Unproven, do not claim merge interaction |

## What not to do

- Do not push strategy-resolved merges to the PR branch as “fixes”  
- Do not take **theirs** for lockfiles without an install/CI policy follow-up  
- Do not treat auto-resolved merge as proof of product correctness without re-test  
- Do not weaken SSR contract by taking **ours** on head_contract paths  

## Proof artifact fields

When recording Codex/Grok evidence:

```json
{
  "merge_construction": {
    "source": "github_pull_merge_ref | local_clean_merge | local_merge_with_strategies",
    "merge_sha": "…",
    "conflicted": [],
    "auto_resolved": [],
    "manual_remaining": [],
    "outcome": { "kind": "…", "merge_interaction_risk": "low|medium|high" }
  }
}
```

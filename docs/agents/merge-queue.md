# Merge queue — `verdant-grow-diary`

**Status:** Active (repository ruleset)  
**Ruleset:** [verdant-grow-diary merge queue](https://github.com/Verdant-OS/verdant-grow-diary/rules/20421416) (id `20421416`)  
**Target branch:** `verdant-grow-diary` only  
**Merge method:** **Squash**  
**Grouping:** `ALLGREEN` · max 1 entry merged per group · up to 5 building  
**Check timeout:** 90 minutes  
**Admin bypass:** repository **Admin** role may bypass on a pull request (emergency only; Cheek)

## Why

Serializes merges so two PRs cannot race the same base (the #720/#721 class of problem). Each queued PR is re-tested against the **latest** queue tip before landing. Green checks from a **pre-queue** SHA do not count after rebase/grouping.

## How agents / humans merge

After Cheek approval and a clean tree:

```bash
# Preferred: enqueue (do not direct-merge when queue is required)
gh pr merge <N> --squash --auto
# or in UI: "Merge when ready" / "Add to merge queue"
```

Do **not** expect a direct `gh pr merge` without queue when the ruleset is active unless using admin bypass.

## Required status checks (queue + ruleset)

Same required set as classic protection:

- `Lint, typecheck, test, build`
- `Preflight — edge shared-lib mirror in sync`
- `test:legal-seo`
- `Full test suite (shard 1/32)` … `(shard 32/32)`

`strict_required_status_checks_policy: true` — branch must be up to date with the base/queue tip for checks.

Non-required reds (deps scan, security-db-local, browser census, etc.) remain **UNSTABLE**, not queue blockers unless later added to this list.

## Monitoring snapshot

Read-only operator/agent view of **queue depth** and **open PR mergeability classes**:

```bash
bun run merge-queue:snapshot
bun run merge-queue:snapshot:json
node scripts/ci/merge-queue-snapshot.mjs --strict   # exit 3 if depth > MERGE_QUEUE_STRICT_MAX_DEPTH (default 5)
```

Requires `gh` auth with repo read. Unit tests (no network):

```bash
bunx vitest run src/test/merge-queue-snapshot.test.ts
```

| Field | Meaning |
|-------|---------|
| `queue_depth` | Entries currently in the merge queue |
| `median_age_sec` / `max_age_sec` | Time since enqueue |
| `DIRTY` | Content conflict — run CONFLICT_RECONCILIATION |
| `BEHIND` | Base moved — update branch; re-run CI |
| `BLOCKED` | Required checks/reviews — not a git conflict |
| `UNSTABLE` | Non-required reds |
| `auto_merge` | PRs with auto-merge / queue request enabled |

Empty queue + high `DIRTY` count is an **ownership/serialisation** signal, not queue latency.


## Alert thresholds

## Dynamic threshold scaling

Enabled by default via `scaling` in [`merge-queue-thresholds.json`](../../scripts/ci/merge-queue-thresholds.json).

```text
factor = clamp(open_pr_total / baseline_open_prs, min_factor, max_factor)
```

| Setting | Default | Role |
|---------|--------:|------|
| `baseline_open_prs` | 10 | Load reference |
| `min_factor` | 1.0 | Never loosen floors below base |
| `max_factor` | 2.5 | Cap inflation under large backlogs |
| `count_metrics` | dirty/behind/blocked/auto_merge | Scale absolute counts |
| `depth_metrics` | queue_depth | Mild scale, capped at `depth_max_cap` (5) |
| age metrics | fixed | Stay timeout-bound (30m / 90m) |

**Ratio alerts** (when `open >= min_open_prs`):

| Ratio | Warn | Critical |
|-------|-----:|---------:|
| `dirty / open` | 0.45 | 0.70 |
| `behind / open` | 0.40 | 0.65 |

Disable scaling:

```bash
node scripts/ci/merge-queue-snapshot.mjs --no-scale
MERGE_QUEUE_SCALE=0 bun run merge-queue:snapshot:alert
```

Example: 13 open PRs → factor ≈ 1.3 → `dirty_open_prs` warn rises from 5 → 7. Absolute `dirty=6` may clear while `dirty_ratio=0.46` still warns.



Canonical config: [`scripts/ci/merge-queue-thresholds.json`](../../scripts/ci/merge-queue-thresholds.json)

| Metric | Warn | Critical | Intent |
|--------|-----:|---------:|--------|
| `queue_depth` | 3 | 5 | Sustained serial backlog |
| `max_age_sec` | 1800 (30m) | 5400 (90m) | Near ruleset check timeout |
| `median_age_sec` | 900 | 2700 | Typical clear time when CI green |
| `dirty_open_prs` | 5 | 10 | Conflicts never enqueue |
| `behind_open_prs` | 5 | 12 | Stale heads |
| `blocked_open_prs` | 8 | 15 | Required gates stuck |
| `auto_merge_waiting` | 3 | 6 | Queue requests not draining |

```bash
bun run merge-queue:snapshot:alert          # exit 4 on critical
node scripts/ci/merge-queue-snapshot.mjs --alert --fail-on-warn   # exit 5 on warn
```

Scheduled job: `.github/workflows/merge-queue-snapshot.yml` (daily 14:05 UTC + workflow_dispatch).  
Tune thresholds in the JSON file only — no code change required.

Null ages (empty queue) **do not** alert. High `DIRTY` with empty queue is an ownership signal, not queue latency.

## Conflict flags vs queue

| GitHub state | Meaning | Queue action |
|--------------|---------|--------------|
| `CONFLICTING` / `DIRTY` | Content conflict | **Cannot enqueue** until resolved or PR closed superseded |
| `MERGEABLE` + `BLOCKED` | Required checks/reviews | Fix gates; then enqueue |
| `MERGEABLE` + `UNSTABLE` | Non-required reds | May enqueue if required are green |
| `BEHIND` | Base moved | Update/rebase; **re-run CI**; then enqueue |

Merge queue does **not** replace the Verdant conflict-resolution rule:

```text
Same complete intent already on base → CLOSE SUPERSEDED
Never hybrid-patch only to become mergeable
Never reuse green checks from pre-resolution SHA
```

## Failure modes

| Event | Expected outcome |
|-------|------------------|
| Queue entry conflicts with tip | Entry removed / fails; author rebases |
| Required check fails on queue build | Entry fails; not merged |
| Timeout (90m) | Entry fails |
| Two PRs same files | Second waits; may go dirty when first lands → supersession audit |

## Safety

- No force-push to `verdant-grow-diary` (ruleset: non-fast-forward + deletion blocked).
- Bypass is **Admin + pull_request only** — not a substitute for a clean tree when the goal is correctness.
- Agents with `merge_permission: none` still only **request** enqueue; Cheek (or authorized admin) owns ship.

## Verify ruleset

```bash
gh api repos/Verdant-OS/verdant-grow-diary/rulesets/20421416
```

## Related

- Classic branch protection still lists the same required contexts (defense in depth).
- [GitHub merge queue docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

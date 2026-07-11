# Controlled resumable Vitest runner

A crash-safe, sharded, resumable runner for Verdant's Vitest suite.

Lives under `scripts/vitest-controlled/`. It does **not** replace
`scripts/run-vitest-batches.mjs` or any PR-default gate — it is an
additional controlled command used for the full suite and the manual
`vitest-controlled-full-suite.yml` matrix workflow.

## Guarantees

- **`pool=forks`, `maxWorkers=8`, `minWorkers=2`** — matches the
  Slice G.1j controlled command that ran the full suite green.
- **Deterministic manifest** — same `src/**/*.{test,spec}.{ts,tsx}`
  include as `vitest.config.ts`, normalized to POSIX paths, sorted,
  duplicate-rejected, hashed.
- **Structured per-file progress** (`progress.jsonl`, append-only,
  fsync per write) via a custom reporter.
- **Resume-safe** — completed files are never re-run; completed
  failures stay failed; resume refuses if the source fingerprint,
  manifest, package/lock, or reporter schema drifts.
- **Sharded** — union of shards equals manifest, pairwise
  intersection is empty; aggregate job proves exact coverage.
- **No config changes** — the 5-second `testTimeout`, retry count,
  jsdom environment, isolation, and `fileParallelism` all remain at
  the values in `vitest.config.ts`.

## Files

| Path | Purpose |
|---|---|
| `scripts/vitest-controlled/manifest.mjs` | Deterministic file discovery + hashing |
| `scripts/vitest-controlled/sharding.mjs` | Shard math + batch splitting |
| `scripts/vitest-controlled/fingerprint.mjs` | Source-fingerprint helpers |
| `scripts/vitest-controlled/reporter.mjs` | Vitest reporter emitting JSONL events |
| `scripts/vitest-controlled/summarizer.mjs` | Structured summary + aggregate helpers |
| `scripts/vitest-controlled/cli.mjs` | CLI dispatcher |
| `.github/workflows/vitest-controlled-full-suite.yml` | Manual matrix runner |

## Commands

```bash
# One shard (default: 30 files/batch, deadline 480s).
bun run test:vitest:controlled -- --shard 1/16

# Resume an interrupted run (only files without a terminal event).
bun run test:vitest:resume -- --run-dir .vitest-runs/<runId>

# Rerun only failed files into a sibling directory.
bun run test:vitest:rerun-failed -- --run-dir .vitest-runs/<runId>

# Regenerate/inspect a summary.
bun run test:vitest:summarize -- --run-dir .vitest-runs/<runId> --json

# Aggregate multiple shard directories against the current manifest.
bun run test:vitest:aggregate -- .vitest-runs/<runId-1> .vitest-runs/<runId-2>
```

## Run directory layout

```
.vitest-runs/<runId>/
  run.json           run configuration + fingerprint + schema versions
  manifest.json      full deterministic file list + hash
  shard-files.json   this shard's assigned files
  progress.jsonl     append-only file-completion events
  raw/               per-batch raw vitest logs (diagnostics only)
  summary.json       structured summary (authoritative)
  summary.md         human-readable Markdown summary
  exit-code          orchestrator exit code
  run-meta           per-batch orchestrator metadata
  completed          written last, only when every file has terminal result
```

`run.json` never records source contents, environment values,
secrets, or tokens — only aggregate hashes.

## Exit codes

- `0` — complete, all files passed
- `1` — complete with test failures (or incomplete files after deadlines)
- `2` — configuration / manifest / fingerprint / artifact integrity error
- `130` — interrupted (SIGINT/SIGTERM); `completed` marker is not written

## Resume semantics

A file is complete only when the reporter records a terminal
`event: "file"` line for it. On `resume`:

- Passed files are not rerun.
- Failed files remain failed and are not rerun (use `rerun-failed`).
- Skipped files remain skipped.
- Files that never received a terminal event are rerun.
- Conflicting duplicate events (same file, different result) or
  corrupt JSONL lines cause resume to **refuse** with exit `2` —
  the run is invalid, not silently green.

Resume additionally recomputes the source fingerprint and the
manifest dirty-tree hash. Any drift refuses the resume — that
guarantees CI cannot resume progress produced against a different
commit or working tree.

## Batch-deadline behavior

Each batch child process is bounded by `--batch-deadline-ms`
(default 480s, below the 600s sandbox shell window). Deadline
expiration terminates the child and leaves any files without a
terminal event marked `incomplete` — a subsequent `resume` picks
them up. Deadlines never convert an incomplete file to `failed`.

## CI aggregate contract

The `controlled-aggregate` job:

1. Downloads every shard artifact.
2. Rebuilds the expected manifest from the checked-out code.
3. Passes it to `cli.mjs aggregate` which proves:
   - every expected file has exactly one terminal result,
   - no file appears in multiple shards,
   - all shards share the same manifest hash,
   - all shards used the same source fingerprint,
   - final file/test totals reconcile.
4. Fails the job unless aggregate status is `complete`.

A green shard matrix without a green aggregate is **not** a green
full suite.

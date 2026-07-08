# CI full test suite — sharding

## Why

The full Vitest suite is ~21k tests across ~1,585 files, most under a jsdom
environment. Run as a single `bunx vitest run` on one `ubuntu-latest` runner it:

- took ~24 minutes wall-clock, exceeding the job's `timeout-minutes: 20`, and
- exhausted the runner's Node heap (`FATAL ERROR: ... JavaScript heap out of
memory`) partway through.

Both failures were infrastructure limits of running everything on one runner —
not test regressions. They blocked the `Lint, typecheck, test, build` job from
ever reaching its `Build` step and left CI perpetually red.

## How it's structured now

Two jobs in `.github/workflows/ci.yml`:

- **`test`** — lint, typecheck, all stop-ship static-safety gates, the scanner
  guardrail sentinel, and `Build`. Fast; no longer runs the full suite, so it
  reaches `Build` and can go green on its own.
- **`full-suite`** — a `matrix.shard: [1, 2, 3, 4]` job. Each shard runs
  `bunx vitest run --shard=<n>/4` on its own runner. Vitest partitions the file
  set deterministically, so the four shards together cover 100% of the suite.

Each shard covers ~1/4 of the files, so:

- wall-clock per shard drops to a few minutes (well under the 20-minute cap), and
- peak memory per runner drops ~4x, which removes the OOM.

`fail-fast: false` keeps the other shards running when one fails, so a single
failure still surfaces the full picture instead of cancelling siblings.

## Changing the shard count

Update **both** the `matrix.shard` list and the `/N` divisor in the
`Run test shard` command — they must agree. Raise N if the suite grows and a
single shard again approaches the timeout.

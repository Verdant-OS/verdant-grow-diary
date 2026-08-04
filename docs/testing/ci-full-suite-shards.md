# CI full test suite — sharding

## Why

The full Vitest suite is ~21k tests across ~1,585 files, most under a jsdom
environment. Run as a single `bunx vitest run` on one `ubuntu-latest` runner it
took ~24 minutes wall-clock, exceeding the job's `timeout-minutes: 20`. Splitting
it across parallel runners keeps each shard well under the timeout.

## How it's structured now

Two jobs in `.github/workflows/ci.yml`:

- **`test`** — lint, typecheck, all stop-ship static-safety gates, the scanner
  guardrail sentinel, and `Build`. Fast; does not run the full suite, so it
  reaches `Build` and can go green on its own.
- **`full-suite`** — a `matrix.shard: [1 … 32]` job (branch-protection contexts).
  Each gate job runs **eight sequential** vitest processes
  (`--shard=(8N-7)..(8N)/256 --pool=forks --maxWorkers=1 --isolate
--passWithNoTests`). Vitest partitions files deterministically (SHA-1 of path),
  so the 256 sub-shards together cover 100% of the suite. Process restarts
  reset V8 between sub-shards to avoid cross-file heap growth (#697).

Each gate job covers 8/256 of the files (~11 files per process with ~2.7k
files), and:

- eight sequential processes usually finish under the 75-minute job timeout
  when individual sub-shards stay healthy (raised from 45m after heavy shards
  cancelled mid-run on #697), and
- peak worker heap stays under the 8GB `NODE_OPTIONS` ceiling on 16GB runners.

## Memory — and the OOM that is now fixed

For a while the suite was split into **36** shards to dodge a
`FATAL ERROR: Reached heap limit` OOM. That OOM was **not** diffuse jsdom
accumulation across files. It was a single test file,
`src/test/ecowitt-bridge-status-page.test.tsx`, whose `useToast` mock returned a
fresh object every render; that spun an **unbounded render loop** in the
auto-refreshing `EcowittLocalForwardingStatusWidget` it rendered, exhausting the
worker's V8 heap. See #188.

With that bug fixed, per-file memory is usually bounded, but residual cross-file
heap growth under `--isolate` still forces **process restarts** on this suite.
32 named gate shards each run eight sequential 1/256 sub-shards so V8 restarts
mid-suite (#697 OOM). Even 1/128 (~21 files/process) still hit ~7.3GB and
fatal OOM on gate shard 30 sub-shard 118/128; 1/256 (~11 files/process) is the
current floor.

The shard command sets `NODE_OPTIONS=--max-old-space-size=8192`. Shards use maxWorkers=1 so a single 8GB heap stays under the 16 GB runner
without multi-worker multiply (see #697). A ceiling below the file load also makes any regression OOM fail
fast rather than GC-thrash to the 20-minute timeout.

> Note: cross-file `document.body` accumulation is separately mitigated by a
> global `afterEach(cleanup(); document.body.replaceChildren())` in
> `src/test/setup.ts`, which keeps tests pool/order-independent. Do not remove
> it — larger shards (more files per worker) rely on it.

`fail-fast: false` keeps the other shards running when one fails, so a single
failure still surfaces the full picture instead of cancelling siblings.

## Changing the shard count

Update **both** the `matrix.shard` list and the `/N` divisor in the
`Run test shard` command — they must agree. Raise N if the suite grows and a
single shard again approaches the timeout.

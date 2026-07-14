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
- **`full-suite`** — a `matrix.shard: [1 … 8]` job. Each shard runs
  `bunx vitest run --shard=<n>/8` on its own runner. Vitest partitions the file
  set deterministically (by path hash), so the 8 shards together cover 100% of
  the suite.

Each shard covers ~1/8 of the files (~200), and:

- the vitest step runs in ~90s per shard (measured on Linux/Node 20), so total
  job time — checkout + install + ripgrep + vitest — stays far under the
  20-minute cap, and
- peak worker heap stays well below the memory ceiling.

## Memory — and the OOM that is now fixed

For a while the suite was split into **36** shards to dodge a
`FATAL ERROR: Reached heap limit` OOM. That OOM was **not** diffuse jsdom
accumulation across files. It was a single test file,
`src/test/ecowitt-bridge-status-page.test.tsx`, whose `useToast` mock returned a
fresh object every render; that spun an **unbounded render loop** in the
auto-refreshing `EcowittLocalForwardingStatusWidget` it rendered, exhausting the
worker's V8 heap. See #188.

With that bug fixed, per-file memory is bounded (each file peaks at low hundreds
of MB and is freed), so shard count is governed by **per-shard wall-clock**, not
memory. 8 shards is ample; a two-shard sample run on Linux/Node 20 at the CI cap
(`--max-old-space-size=3584`) completed ~200 files each in ~90s with no OOM and
no cross-file failures.

The shard command sets `NODE_OPTIONS=--max-old-space-size=3584`. The forks pool
runs ~4 workers on the 4-vCPU runner, so 4 × 3584 MB ≈ 14 GB stays under the
16 GB runner. A ceiling below the file load also makes any regression OOM fail
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

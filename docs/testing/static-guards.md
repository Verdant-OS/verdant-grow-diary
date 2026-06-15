# Static guard tests

This repo splits its test suite into two complementary tracks:

1. **Main regression suite** — behavior, unit, and view-model tests. Run via
   `bunx vitest run` or `bun run test`. Fast, deterministic, and the primary
   signal for product correctness.
2. **Static guard suite** — repo-wide filesystem-walking scanners that enforce
   safety invariants (source ownership, no raw payload / token leakage, no
   device control, no RPC misuse, no route/helper leakage, etc.) by reading
   every `.ts`/`.tsx` file under `src/`. Run via `bun run test:static-guards`.

The static guards use `src/test/testFileSearchRules.ts#findMatches`, which
walks broad paths (e.g. `findMatches(["src"], ...)`). In slow sandboxes these
walks can hit Vitest's default 5000ms test timeout even though the assertions
themselves are sound. Splitting them out makes timeout noise easier to
attribute and keeps the main suite fast.

## When the static guards time out

Run the timeout summarizer to confirm failures are environmental, not real
regressions:

```bash
bun run test:summarize-timeouts < vitest-output.log
```

A "timeout-only" verdict means the guards did not detect a real safety
regression; only the sandbox was too slow to finish the fs walk.

## CI

CI runs the static guards as a dedicated step
(`Repo-wide static guard tests (fs-walking)`) so a slow runner does not
obscure the main test signal. The full Vitest suite still includes these
files; future work may exclude them from the default run once the explicit
step has bedded in.

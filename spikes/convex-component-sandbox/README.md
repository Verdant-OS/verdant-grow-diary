# Convex component physical-sandbox spike

This is a disposable, local-only architecture experiment for
`GAP-CONVEX-001`. It asks one question: can a small Convex component enforce a
data namespace that prevents direct parent/component table access? This is
component isolation inside one local deployment, not a separate server,
database, or deployment.

The parent `grower_notes` table is a **synthetic fixture, not plant memory**.
The component receives only a SHA-256 key plus numeric rate-limit inputs. No
Verdant account, diary, sensor, billing, AI-credit, Action Queue, automation,
or device-control data belongs here.

## Safety boundary

- Nothing in this folder is imported by Verdant production source.
- Convex is pinned in this folder's lockfile and is absent from the root app.
- Anonymous local mode is the only authorized backend mode.
- No browser route or HTTP action exposes component functions.
- Cloud publication and production adoption are forbidden by the governing
  specification.
- `.env.local`, local backend state, admin keys, and deployment keys are
  ignored.

## Install and validate

From this directory:

```powershell
bun install --frozen-lockfile
bun run validate
```

The deterministic suite runs with `convex-test`. That package is a useful
backend mock, but it is not a security boundary and does not fully reproduce
Convex function visibility enforcement. P5 and P6 therefore use two layers:

1. Compile-negative fixtures prove each generated data model excludes the
   other side's table and identifier.
2. A real anonymous local backend confirms the namespaces cannot observe or
   mutate one another.

The point-in-time local run is recorded in
[`artifacts/anonymous-local-proof-2026-08-13.json`](artifacts/anonymous-local-proof-2026-08-13.json).
It is a sanitized observation receipt, not an automated CI result. The receipt
records the repository base commit and SHA-256 hashes for every mounted source
and generated schema file; the proof suite fails if those files drift.

## Mount the real anonymous local backend

```powershell
$env:CONVEX_AGENT_MODE = "anonymous"
bunx convex dev --once --typecheck enable --typecheck-components --tail-logs disable
```

This downloads and starts a local backend without a Convex account, mounts
`abuse_guard`, typechecks the parent and component, then exits. It may create
ignored `.env.local` and `.convex/` files.

For an interactive local proof, remove `--once` in terminal A. In terminal B,
set `CONVEX_AGENT_MODE` again and invoke component functions with the pinned
CLI. This example uses a deliberately synthetic digest:

```powershell
$payload = '{"keyHash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","nowMs":1000,"windowMs":60000,"max":5}'
1..6 | ForEach-Object {
  bun node_modules/convex/bin/main.js run check:consume $payload --component abuse_guard
}
```

Expected remaining values are `4, 3, 2, 1, 0, 0`; the final result is a deny.
Use `isolationProbe:attemptParentTableRead` in the component to confirm it
returns no parent row, and use
`componentMutationProbe:attemptDirectComponentPatch` in the parent with a
component bucket ID to confirm the patch fails. The compile-negative tests are
the authoritative regression fence; the runtime recipe confirms the platform
namespace behavior.

## Proof status captured 2026-08-13

| Proof                                             | Result  | Evidence                                                                                        |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| P1 five allows, sixth deny                        | PASS    | unit mock; observed anonymous local run with committed receipt                                  |
| P2 exact window reset                             | PASS    | unit mock; observed anonymous local run with committed receipt                                  |
| P3 invalid input writes nothing                   | PASS    | validation errors plus zero snapshot                                                            |
| P4 deterministic check                            | PASS    | repeated mock and local calls agree                                                             |
| P5 component cannot observe parent table          | PASS    | compile-negative fixture; receipt records local no-row result while parent retained its fixture |
| P6 parent cannot patch component table            | PASS    | compile-negative fixture; receipt records rejected non-null component ID and unchanged stores   |
| P7 parent text is not a component argument/return | PASS    | component-tree static scan                                                                      |
| P8 synthetic fixture value absent from component  | PASS    | component-tree static scan                                                                      |
| P9 fresh-process repeatability                    | PASS    | dedicated second Vitest process                                                                 |
| Cloud backend                                     | SKIPPED | expressly outside the approved spike                                                            |

These results demonstrate the narrow component-isolation property. They do not
approve Convex for production or establish that it should replace Supabase.

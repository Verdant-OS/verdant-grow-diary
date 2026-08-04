# TanStack route migration — “test-complete” success criteria

**Purpose:** Definition of done for the _test/docs residual_ after file-route
runtime migration. Orthogonal to PR #694 (SSR Supabase init).

**Measured against:** deploy/PR head style tree (`src/routes/**`, no `src/App.tsx`).

**Baseline (head `a28cd69`, 2026-08-03):**

| #   | Criterion                                                               | Baseline                                                                       | Status     |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| C1  | Zero test files open `src/App.tsx`                                      | **79** files reference `App.tsx` (~67 hard reads)                              | ❌         |
| C2  | `route-manifest-sync` green vs routeTree / routes FS                    | Harness rewritten (`routeManifestSyncHarness`); **27/27** tests green on local | ✅ harness |
| C3  | Operator/sensor guard parity uses `_app` + `RequireOperatorRole` layout | Runtime: `_app/_operator.tsx` ✅ · tests still scrape App.tsx ❌               | ⚠️ partial |
| C4  | Full Vitest not dominated by ENOENT App.tsx                             | 15-file Full Vitest sample heavily App.tsx / static route debt                 | ❌         |
| C5  | STATE.md Step 9 + prerender decision closed or scheduled                | Step 9 open; prerender deferred undecided                                      | ❌         |

---

## C1 — Zero test files open `src/App.tsx`

### Pass when

```bash
# Must print 0
grep -rl 'App\.tsx' src/test --include='*.ts' --include='*.tsx' | wc -l
# Must print 0 (hard reads / path constants)
grep -rnl 'App\.tsx' src/test src/lib/appRouteManifest.ts \
  src/test/helpers/routeManifestSyncHarness.ts 2>/dev/null | wc -l
test ! -f src/App.tsx
```

- No `readFileSync(..., "App.tsx")`, no `read("src/App.tsx")`, no `APP_TSX_PATH`.
- Comments may mention “Classic App.tsx” **only** in historical docs outside `src/test`.
- Prefer one helper: e.g. `extractMountedRoutePaths()` from routes FS / `routeTree.gen.ts`.

### Fail examples

- `routeManifestSyncHarness` opening `src/App.tsx`
- Feature static tests grepping Classic `path="/…"` in App source

---

## C2 — `route-manifest-sync` green against routeTree / routes FS

### Pass when

```bash
bunx vitest run src/test/route-manifest-sync.test.ts src/test/app-route-manifest.test.ts
# exit 0; 0 failed
```

Harness must:

1. **Source of mounted paths:** `src/routes/**/*.tsx` + TanStack naming  
   (`_app`, `_operator`, `$param`, `index` → URL paths), **or** parse  
   `src/routeTree.gen.ts` — **not** App.tsx.
2. **Policy source:** `APP_ROUTES` in `appRouteManifest.ts` (access / feature / nav).
3. Bidirectional diff still fails on:
   - mounted but missing from manifest
   - manifest but not mounted
   - duplicate / unsorted manifest paths

### Implementation note

Update `src/test/helpers/routeManifestSyncHarness.ts` first; most C1 consumers
can switch to its exports without rewriting product code.

---

## C3 — Operator / sensor guard parity on file routes

### Runtime (already largely true)

| Classic                                     | TanStack                                                           |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `<Route element={<RequireOperatorRole />}>` | `src/routes/_app/_operator.tsx` → `component: RequireOperatorRole` |
| Operator pages under that block             | `src/routes/_app/_operator/**` (e.g. `operator.*`, sensors audits) |
| Auth shell                                  | `src/routes/_app.tsx` → `AppShell`                                 |

### Pass when tests assert layout placement, not App.tsx text

```bash
bunx vitest run \
  src/test/operator-role-gate.test.ts \
  src/test/sensor-route-guard-parity.test.ts \
  src/test/route-manifest-operator-gating.test.ts
# exit 0
```

Assertions should require:

- Single operator layout route: `/_app/_operator` (file `_operator.tsx`).
- Every manifest `access: "operator"` path maps to a module under  
  `src/routes/_app/_operator/` (or explicit allowlisted exceptions).
- Sensor operator surfaces live under `_operator` (e.g.  
  `sensors.ecowitt-audit`, `sensors.ingest-normalizer`); public sensor previews  
  may stay outside (document exceptions).
- **No** requirement that `RequireOperatorRole` appear N times in App.tsx source.

---

## C4 — Full Vitest not dominated by ENOENT App.tsx

### Pass when

On CI Full Vitest (or local batched equivalent):

1. **Zero** failures whose root error is  
   `ENOENT: … open '…/src/App.tsx'`.
2. Among remaining failures, App.tsx/static-route debt is **not** the plurality  
   (track via log parse).

```bash
# After a failed Full Vitest log:
grep -c "ENOENT.*App\.tsx" full-vitest.log   # must be 0
```

C4 is a **consequence** of C1–C3; do not “fix” by skipping those tests.

---

## C5 — STATE.md Step 9 + prerender decision

### Pass when `.lovable/migrate-to-tanstack/STATE.md` contains

1. **Step 9:** either
   - `typecheck` error count **0** (or agreed ceiling with owners), **or**
   - explicit “Step 9 closed with residual N, owners, follow-up issue/PR links”.
2. **Prerender/OG pipeline:** one of:
   - **Closed:** TanStack `head()` + postbuild OG/seo-manifest restored and  
     `check:jsonld` / `check:og-*` / head-fidelity green on production build; **or**
   - **Scheduled:** dated ADR / issue with owner, acceptance commands, and  
     “not blocking route test-complete C1–C4” if split.

```bash
# Documentation gate (human + grep)
grep -E 'Step 9|prerender|seo-manifest' .lovable/migrate-to-tanstack/STATE.md
```

C5 may ship **after** C1–C4 if product agrees route-test-complete ≠ full migration-complete.

---

## Suggested work order

| Order |                                             Work | Unlocks               |
| ----- | -----------------------------------------------: | --------------------- |
| 1     |      Rewrite `routeManifestSyncHarness` + fix C2 | Foundation            |
| 2     |        Bulk-replace App.tsx reads → harness (C1) | Mass static tests     |
| 3     | Operator/sensor parity tests → layout paths (C3) | Guard contracts       |
| 4     |              Confirm Full Vitest ENOENT = 0 (C4) | CI signal             |
| 5     |                STATE Step 9 + prerender ADR (C5) | Migration bookkeeping |

**Out of scope for this DoD:** PR #694 SSR storage contract, Biome format, lockfile policy.

---

## Sign-off checklist

- [ ] C1 command → 0
- [ ] C2 vitest → green
- [ ] C3 operator/sensor vitest → green
- [ ] C4 Full Vitest log → 0× ENOENT App.tsx
- [ ] C5 STATE.md decision recorded
- [ ] PR description links this doc and shows before/after counts

**Migration test-complete** = C1 ∧ C2 ∧ C3 ∧ C4, with C5 either done or explicitly deferred in STATE.md.

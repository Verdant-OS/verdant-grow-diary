# TanStack Start migration — in-progress state

Resume with: "continue the migration". Undo with: revert this turn from chat history.

## Completed

**Preflight** — eligible Classic stack; baseline `bun run build` green.

**Steps 0–6** — scaffolding, theme port to Tailwind v4, package.json merge, SPA entry
removal, 138 route files + `__root.tsx`, `src/lib/react-router-compat.tsx` shim across
651 importers. (Detail in git history of this file.)

**Step 7** — SSR browser-global guards in `src/integrations/supabase/client.ts`.

**Step 8** — 34 edge functions classified; all left on Supabase (bridges, webhooks,
crons, Deno-only deps). Artifact: `.lovable/migrate-to-tanstack/edge-function-classification.json`.

**Step 9 (closed 2026-08-03) — typecheck residual driven to 0.**

Historical wave: 11,832 → 405 → **0** (re-measured on `chore/adopt-biome-lint` @
`65806fb`+):

```bash
NODE_OPTIONS="--max-old-space-size=8192" bun run typecheck   # tsc -p tsconfig.json --noEmit → exit 0
NODE_OPTIONS="--max-old-space-size=8192" bun run typecheck:tsgo  # tsgo --noEmit → exit 0
```

Earlier Step 9 mitigations retained (do not re-enable without a dedicated PR):

- `tsconfig.json`: `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` remain OFF (template-only; not required by TanStack).
- `src/types/global-jsx.d.ts`, `src/types/mjs-modules.d.ts` ambient shims.
- Compat `MemoryRouter`/`BrowserRouter` prop types; Vitest real provider lives in
  `src/test/helpers/reactRouterCompat.vitest.tsx` (alias from `vitest.config.ts`).

**Note:** default heap may OOM on this repo; CI/local should use ≥8GB
(`NODE_OPTIONS=--max-old-space-size=8192`) for `typecheck` / `typecheck:tsgo`.

## Remaining (post Step 9)

1. **Gate 1 (`bun run build`)** — Vite/Nitro compile passes; `postbuild` validators
   fail until prerender/OG is restored. See C5 prerender decision below.
2. **Gates 3–4** (SSR serve probe, client runtime check) not yet run as a formal
   migration sign-off (product SSR work continues on other PRs, e.g. #694).

## Deferred / needs a decision on resume

1. **Bespoke prerender/OG pipeline overwritten** by the Step 1 `vite.config.ts` write.
   Recovered source: `git show abb4ae428:vite.config.ts`. It hung off `index.html` as a
   Rollup bundle asset (now gone) and emitted: per-route OG PNGs via Resvg,
   `buildStaticSocialRouteHtml` clones, JSON-LD injection, and `dist/seo-manifest.json`
   — which `check:jsonld`, `check:og-images`, `check:canonical-*`,
   `check:sitemap-robots` and the head-fidelity vitest all read. Correct re-expression
   is TanStack `head()` per route + prerender config, with a post-prerender step that
   still emits the OG PNGs and `seo-manifest.json` against the new `dist/` shape.
   **This is the largest remaining product migration piece.** Tracked under C5
   (scheduled) below — **not blocking** route test-complete C1–C4.
2. `vitest.config.ts` deliberately kept (274 scripts + ~30 workflows bind to it); still
   needs repointing at `src/styles.css` if CSS-import contracts require it.
3. ~~Legacy `<MemoryRouter>` no-op~~ **Addressed for Vitest** via
   `reactRouterCompat.vitest.tsx` (#699). Product shim remains a thin compile shell by
   design.
4. Tailwind v4 scale renames unapplied (`shadow-sm`→`shadow-xs`, bare `ring`→`ring-3`,
   etc.). Bulk rewrite unsafe: the same words appear in grower-facing copy constants.
   1px visual drift, not a break.

## Route test residual (C1–C4) — tracking on PR #699

Landed on `chore/adopt-biome-lint` (orthogonal to SSR #694 product scope):

| Criterion | Status |
| --- | --- |
| C1 Zero hard `App.tsx` reads | ✅ |
| C2 `route-manifest-sync` vs file routes | ✅ |
| C3 Operator/sensor layout parity | ✅ |
| C4 Zero Full Vitest `ENOENT …/App.tsx` | ⚠️ local residual set **0× ENOENT**; Full CI log audit pending |
| C5 Step 9 + prerender decision | Step 9 ✅ closed (0 errors); prerender **scheduled** below |

**Merge path:** merge #699 into `verdant-grow-diary` once required checks (esp. Full
Vitest + biome) are green — clears base-owned App.tsx ENOENT for future three-ref proofs.

---

## C5 decisions (2026-08-03)

**Authority:** route test-complete DoD
`docs/migration/tanstack-route-test-complete-criteria.md` §C5.

### Step 9 typecheck — CLOSED

| Field | Value |
| --- | --- |
| Status | **Closed with residual 0** |
| Measured | 2026-08-03 on branch `chore/adopt-biome-lint` |
| Commands | `NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` → exit 0; `… typecheck:tsgo` → exit 0 |
| Residual N | **0** |
| Owner | n/a (closed) |
| Follow-up | Keep heap note in CI typecheck jobs if not already present; do not re-open Step 9 for cosmetic tsconfig flag churn without a dedicated PR |

### Prerender / OG / seo-manifest — SCHEDULED (not closed)

| Field | Value |
| --- | --- |
| Status | **Scheduled** — **does not block** route test-complete C1–C4 |
| Date | 2026-08-03 |
| Owner | Migration / SEO follow-up PR (separate from #699 Biome + route-test residual) |
| Problem | Classic postbuild OG/seo-manifest pipeline was overwritten by TanStack Start `vite.config.ts`; validators and `test:legal-seo` expect restored artifacts |
| Approach | TanStack route `head()` + prerender (or postbuild re-emit) producing OG PNGs + `dist/seo-manifest.json` in the new dist shape; recovered Classic reference: `git show abb4ae428:vite.config.ts` |

**Acceptance commands (when this item is closed):**

```bash
bun run build
# full package.json "postbuild" chain must pass (seo artifacts + validators)
bun run test:legal-seo
# optional: sitemap/head fidelity jobs green on the PR that closes this
```

**Explicit non-block:** route test-complete = C1 ∧ C2 ∧ C3 ∧ C4 with this C5 prerender
item **scheduled** (Step 9 already closed). Shipping #699 without prerender restore is
allowed under this decision.


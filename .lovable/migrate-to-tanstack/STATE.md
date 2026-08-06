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

**Step 9 (in progress) — typecheck wave absorbed from 11,832 → 405 errors.**

- `tsconfig.json`: turned OFF `noPropertyAccessFromIndexSignature`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. These were added by the
  template, were NOT in the pre-migration tsconfig, and are not required by TanStack
  Router (which needs only `strictNullChecks`, still on via `strict`). ~7,700 errors.
  No `@ts-nocheck`, no `@ts-ignore`, no `strictNullChecks` rollback anywhere.
- Fixed 3 test files whose regex literals were corrupted by the Step 6 bulk
  `react-router-dom` → `@/lib/react-router-compat` sed (unescaped `/` inside `/.../`).
- `src/lib/react-router-compat.tsx`: legacy `BrowserRouter`/`MemoryRouter` shims now
  accept `initialEntries` / `initialIndex` / `basename` (compile-only). ~267 errors.
- `src/types/global-jsx.d.ts`: re-declares the global `JSX` namespace React 19 removed,
  aliased to `React.JSX`. 31 errors.
- `src/types/mjs-modules.d.ts`: shorthand ambient `declare module "*.mjs"` so vitest
  contract tests can import untyped `scripts/*.mjs` (matches pre-migration
  `noImplicitAny: false` behavior). ~106 errors.
- `src/pages/PlantDetail.tsx`: `strain ?? ""` and an explicit `if (!plant) return null`
  narrowing guard after all blocked-state returns. 150 errors.

## Remaining — Step 9

1. **405 typecheck errors left.** Long tail, no single cluster > ~30. Dominated by
   `src/test/*` contract tests (TS7006 implicit-any params, TS2322 shape mismatches
   against now-`any` `.mjs` imports) plus scattered `strictNullChecks` hits in
   components (`ActionQueueDetailDrawer.tsx` 9, etc.). Mechanical, file-by-file.
2. **Gate 1 (`bun run build`)** — Vite/Nitro compile passes; `postbuild` validators
   fail. See deferred item 1.
3. **Gates 3–4** (SSR serve probe, client runtime check) not yet run.

## Deferred / needs a decision on resume

1. **Bespoke prerender/OG pipeline overwritten** by the Step 1 `vite.config.ts` write.
   Recovered source: `git show abb4ae428:vite.config.ts`. It hung off `index.html` as a
   Rollup bundle asset (now gone) and emitted: per-route OG PNGs via Resvg,
   `buildStaticSocialRouteHtml` clones, JSON-LD injection, and `dist/seo-manifest.json`
   — which `check:jsonld`, `check:og-images`, `check:canonical-*`,
   `check:sitemap-robots` and the head-fidelity vitest all read. Correct re-expression
   is TanStack `head()` per route + prerender config, with a post-prerender step that
   still emits the OG PNGs and `seo-manifest.json` against the new `dist/` shape.
   **This is the largest remaining piece of work after the type tail.**
2. `vitest.config.ts` deliberately kept (274 scripts + ~30 workflows bind to it); still
   needs repointing at `src/styles.css`.
3. Legacy `<MemoryRouter>`-wrapped unit tests compile but no longer exercise routing —
   they need rewriting against the TanStack router.
4. Tailwind v4 scale renames unapplied (`shadow-sm`→`shadow-xs`, bare `ring`→`ring-3`,
   etc.). Bulk rewrite unsafe: the same words appear in grower-facing copy constants.
   1px visual drift, not a break.

## Route test residual (C1–C4) — tracking on PR #699

Landed on `chore/adopt-biome-lint` (not blocking SSR #694):

- **C1–C3** route-manifest harness + App.tsx scrape rewire + operator/sensor layout asserts.
- **C4 advance:** Vitest MemoryRouter alias (`reactRouterCompat.vitest.tsx`) preserves
  `location.state`, strips TanStack internal state keys for RR parity; checkout-return
  funnel unit tests green. Full Vitest Suite CI on PR #699 is the remaining C4 sign-off.
- **Merge path:** merge #699 into `verdant-grow-diary` once required checks (esp. Full
  Vitest + biome) are green — that clears base-owned App.tsx ENOENT for future proofs.

## C5 decisions (2026-08-03) — scheduled, not closed

### Step 9 typecheck

- Residual remains open (~405 last measured in this file). **Not blocking** route
  test-complete (C1–C4). Owner: migration follow-up PR after #699.
- Acceptance: `bun run typecheck` → 0 errors **or** explicit residual count + issue links
  recorded here.

### Prerender / OG / seo-manifest

- **Scheduled (not blocking C1–C4).** Re-express Classic postbuild OG pipeline against
  TanStack `head()` + new `dist/` shape; restore `seo-manifest.json` consumers
  (`check:jsonld`, `check:og-*`, head-fidelity).
- Acceptance commands (when closed):
  - `bun run build` + full `postbuild` chain green
  - `bun run test:legal-seo` green
- Recovered source pointer: `git show abb4ae428:vite.config.ts` (see deferred item 1 above).

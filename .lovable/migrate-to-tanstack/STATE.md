# TanStack Start migration — in-progress state

Resume with: "continue the migration". Undo with: revert this turn from chat history.

## Completed

**Preflight** — eligibility passed (Classic `vite_*` stack); `bun run build` green on the
pre-migration baseline (75 prerendered SEO docs, all validators passing).

**Step 0 — scan.** 114 flat routes in `src/App.tsx`; providers
`RootErrorBoundary > QueryClientProvider > TooltipProvider > BrowserRouter > AuthProvider >
GrowsProvider`; 36 edge functions; bespoke prerender/OG/JSON-LD Vite pipeline; loose
TypeScript across ~1,700 files.

**Step 1 — scaffolding.** Written:
`tsconfig.json`, `vite.config.ts`, `bunfig.toml`, `eslint.config.js`, `components.json`,
`src/router.tsx`, `src/server.ts`, `src/start.ts`, `src/lib/error-page.ts`,
`src/lib/error-capture.ts`, `src/lib/lovable-error-reporting.ts`, `src/styles.css`.

Theme ported in full from `src/index.css` + `tailwind.config.ts` to Tailwind v4 — every
HSL token, the `.customer-mode` alt theme, gradients/shadows, `font-display`/`font-mono`,
the container, all four keyframes/animations, the component + utility layers, and the
print-report rules. Recorded in `.lovable/migrate-to-tanstack/theme-port.json`.

v4 breaking-pattern sweep: `bg-[--x]` → `bg-[var(--x)]` fixed in
`src/components/ui/sidebar.tsx` and `src/components/ui/chart.tsx`; `outline-none` →
`outline-hidden` across 104 files. The `shadow`/`rounded`/`blur`/`ring` scale renames were
deliberately NOT applied — see Deferred.

**Step 3 — package.json merged.** TanStack Start 1.168 / Router 1.170 / React 19 /
Tailwind 4 / vite 8 / nitro in place; `react-router-dom` dropped. All 274 user scripts and
the `lint-staged` + `overrides` fields carried through. `tsc -p tsconfig.app.json` rewritten
to `tsconfig.json` in 4 scripts.

**Step 5 part 1 — auth-wrapper inventory** written to
`.lovable/migrate-to-tanstack/auth-wrapper-inventory.json`: 5 wrappers, every guarded route
enumerated (AppShell 50, RequireOperatorRole 35, PhenoTrackerUpgradeGate 5, plus the two
global gates).

Backups in `/tmp/migrate-to-tanstack/`: `App.tsx.bak`, `index.html.bak`, `main.tsx.bak`,
`index.css.bak`.

## Not started

- **Step 4** — deleting `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`,
  `tsconfig.app.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`.
  Nothing has been deleted yet.
- **Step 5 part 2** — `src/routes/__root.tsx` and ~114 route files.
- **Steps 6–8** — `useSearchParams` shim, Supabase SSR guard, edge-function classification.
- **Step 9** — install, build, `tsc --noEmit`, route serve checks.
- **Step 10** — metadata flip.

## Deferred / needs a decision on resume

1. **`vite.config.ts` prerender pipeline was overwritten.** The Step 1 template write
   replaced the bespoke config (Resvg OG-card generation, `viteManualChunks`,
   `buildStaticSocialRouteHtml`, JSON-LD injection) with the three-line TanStack wrapper
   plus the preserved `mcpPlugin()`. The helper modules under `scripts/` and `src/lib/` are
   untouched — only the ~80-line wiring file is gone, recoverable from local git. It has to
   be re-expressed as TanStack `head()` data plus prerender config; the postbuild
   validators (`check:jsonld`, `check:og-images`, `check:canonical-*`,
   `check:sitemap-robots`) assert on the old `dist/` shape and will need repointing.
2. **`vitest.config.ts` intentionally kept.** The skill deletes it, but 274 test scripts and
   ~30 CI workflows bind to it. Preserved rather than destroyed; it still needs repointing
   at `src/styles.css` and the new tsconfig.
3. **TypeScript strict flip.** `tsconfig.json` now sets `strict`, `strictNullChecks`,
   `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` against a codebase that ran
   with `strictNullChecks: false` and `noImplicitAny: false`. This is the largest remaining
   item by far and Step 9 cannot go green until it is absorbed.
4. **Tailwind v4 scale renames not applied.** `shadow-sm`→`shadow-xs`, bare `shadow`→
   `shadow-sm`, the `rounded`/`blur` equivalents, and bare `ring`→`ring-3`. Bulk rewriting
   was unsafe here because the same words appear in grower-facing copy constants. Effect is
   a 1px-scale visual drift, not a functional break.

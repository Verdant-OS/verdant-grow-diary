/**
 * viteManualChunks — pure Rollup `manualChunks` classifier for Verdant's
 * production build.
 *
 * Extracted from vite.config.ts so it can be unit-tested as a build contract
 * (see src/test/vite-manual-chunks-contract.test.ts). This module is imported
 * ONLY by the Vite config (build time) and that test — never by app runtime
 * code — so it is not bundled into the app.
 *
 * HARD INVARIANT (do not "optimize" away):
 * The React-context / eval-order graph (react, react-dom, react-router,
 * @tanstack/*, @radix-ui/*, sonner, form libs, …) MUST stay together in the
 * single `vendor` chunk. Those libraries call React.createContext() at
 * module-eval time; splitting them into sibling manual chunks does not
 * guarantee the react chunk initializes first, which white-screens the app
 * with "Cannot read properties of undefined (reading 'createContext')".
 *
 * Only *leaf* libraries with no eval-time createContext dependency may be
 * split into their own long-term-cacheable chunks (a pure data client, pure
 * utilities, icon components). These were verified React-context-free via a
 * per-package diagnostic build (see PR #138).
 */

/**
 * Classify a module id into a manual chunk name. Returns `undefined` for app
 * source (let Rollup group it with its route) and a `vendor*` chunk name for
 * node_modules. Accepts the raw Rollup module id (extra Rollup args ignored).
 */
export function viteManualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  // Heavy, lazily-loaded leaf libraries — charts + spreadsheet export.
  if (/[\\/]node_modules[\\/](recharts|d3-|victory|internmap)/.test(id)) return "vendor-charts";
  if (/[\\/]node_modules[\\/](xlsx|jszip|papaparse|file-saver)[\\/]/.test(id))
    return "vendor-export";
  // @supabase/* is a pure JS data client (auth / realtime / storage /
  // postgrest) — no React, no createContext. ~200 kB, rarely changes.
  if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
  // lucide-react icons render React elements but create no context at eval.
  if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "vendor-icons";
  // Pure, framework-agnostic utilities: schema validation + date math.
  if (/[\\/]node_modules[\\/](zod|date-fns)[\\/]/.test(id)) return "vendor-utils";
  // Everything else (react, react-dom, react-router, @tanstack, radix,
  // sonner, form libs, …) goes in ONE vendor chunk so Rollup orders modules
  // by dependency internally and react initializes before any
  // createContext() call. Do NOT add sibling react/query/radix chunks here.
  return "vendor";
}

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
// Import the ESM build explicitly. The package's `main` is CJS
// (`dist/index.cjs`) and `require("vite")` from that file throws
// ERR_REQUIRE_CYCLE_MODULE on Node 22 (Vite is ESM-only). The ESM
// entry uses `import` and loads cleanly. Do not switch back to the
// bare package specifier — Node will resolve `main` again.
import { defineConfig } from "@lovable.dev/vite-tanstack-config/dist/index.js";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// NOTE (TanStack migration): the legacy `staticSocialRouteDocuments` Vite
// plugin (removed with the SPA shell) emitted 74 per-route HTML documents plus
// dist/seo-manifest.json by patching Vite's single index.html. That shell no
// longer exists under SSR. TanStack Start's own pre-renderer was evaluated as
// the replacement and is NOT usable on this template: its preview-server
// plugin imports `dist/server/<entry>.js`, while the nitro/cloudflare preset
// emits `dist/server/index.mjs`, so every pre-render fetch 500s. Restoring the
// SEO artifact pipeline is a separate, owner-approved slice — see the turn
// report. Do not re-emit static route HTML into dist/client: those files would
// shadow the real SSR routes on Cloudflare asset serving.
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [process.platform !== "win32" && mcpPlugin()].filter(Boolean),
  },
});

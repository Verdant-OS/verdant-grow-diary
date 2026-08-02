// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { STATIC_PUBLIC_OUTPUT_DOCUMENTS } from "./src/lib/build/staticPublicSeoDocuments";

// Pre-render every public acquisition document at build time. Under the SPA
// build these pages were emitted by the `staticSocialRouteDocuments` plugin,
// which patched Vite's single `index.html` shell. That shell no longer exists,
// so the equivalent (and higher-fidelity) mechanism is TanStack Start's
// pre-renderer: each path is rendered through the real app, so a non-JS
// crawler receives exactly the same <head> a JS-executing crawler would.
const PRERENDER_PAGES = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => ({
  path: document.path,
}));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    prerender: { enabled: true, crawlLinks: false },
    pages: PRERENDER_PAGES,
  },
  vite: {
    plugins: [mcpPlugin()],
  },
});

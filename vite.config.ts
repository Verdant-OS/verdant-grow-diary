// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { viteManualChunks } from "./src/lib/build/manualChunks";
import { staticSeoAssets } from "./src/lib/build/staticSeoAssetsPlugin";
import { TANSTACK_PUBLIC_PRERENDER_PATHS } from "./src/lib/build/tanstackPublicSeoHead";

export default defineConfig({
  nitro: {
    output: {
      dir: "dist",
      publicDir: "dist/client",
      serverDir: "dist/server",
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    pages: TANSTACK_PUBLIC_PRERENDER_PATHS.map((path) => ({ path })),
    prerender: {
      enabled: true,
      crawlLinks: false,
      autoStaticPathsDiscovery: false,
      concurrency: 8,
      failOnError: true,
    },
  },
  vite: {
    server: {
      host: "127.0.0.1",
      port: 8080,
      hmr: { overlay: false },
    },
    plugins: [
      staticSeoAssets(),
      // The MCP generator externalizes a machine-local npm:C:\\... import on
      // Windows. Lovable and CI remain on the supported Linux path.
      process.platform !== "win32" && mcpPlugin(),
    ],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: { manualChunks: viteManualChunks },
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  build: {
    // Route pages are code-split (React.lazy in App.tsx); this splits the shared
    // vendor code into cacheable chunks instead of one monolith so the public
    // entry path stays small. Keep the warning limit honest.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Only split the *leaf* heavy libraries that are loaded lazily (charts,
        // spreadsheet export) into their own long-term-cacheable chunks. We
        // deliberately do NOT hand-split the React runtime (react / react-dom /
        // react-router / @tanstack / radix): those all call React.createContext()
        // at module-eval time, and forcing them into sibling manual chunks does
        // not guarantee the react chunk initializes first — which white-screens
        // the app with "Cannot read properties of undefined (reading
        // 'createContext')". Letting Rollup group the React graph keeps init
        // order correct. The big win is still the per-route React.lazy split in
        // App.tsx, so the public entry never pulls charts / export / heavy pages.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory|internmap)/.test(id))
            return "vendor-charts";
          if (/[\\/]node_modules[\\/](xlsx|jszip|papaparse|file-saver)[\\/]/.test(id))
            return "vendor-export";
          // Everything else (react, react-dom, react-router, @tanstack, radix,
          // sonner, lucide, …) goes in ONE vendor chunk. A single chunk lets
          // Rollup order modules by dependency internally, so react initializes
          // before anything calls React.createContext(). This is the safe
          // alternative to sibling vendor-react/vendor-query chunks, which do
          // not guarantee load order and white-screen on 'createContext'.
          return "vendor";
        },
      },
    },
  },
}));

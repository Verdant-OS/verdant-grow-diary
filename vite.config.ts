import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { PRICING } from "./src/constants/pricing";

const SITE_ORIGIN = "https://verdantgrowdiary.com";

/**
 * Bake a SoftwareApplication + Offer JSON-LD block into index.html at build
 * time. Prices are read from src/constants/pricing.ts (the single source of
 * truth) so the structured data can never drift from the pricing page. Static
 * output means non-JS crawlers see it too — no aggregateRating is emitted
 * because we have no real ratings to cite.
 */
function softwareApplicationJsonLd(): Plugin {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_ORIGIN}/#app`,
    name: "Verdant Grow Diary",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_ORIGIN,
    description:
      "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.",
    offers: [
      { "@type": "Offer", name: "Free", price: String(PRICING.free.price), priceCurrency: "USD" },
      {
        "@type": "Offer",
        name: "Pro (monthly)",
        price: String(PRICING.pro.monthlyPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Pro (annual)",
        price: String(PRICING.pro.annualPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Founder Lifetime",
        price: String(PRICING.founder.price),
        priceCurrency: "USD",
      },
    ],
  };
  return {
    name: "verdant-softwareapplication-jsonld",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          children: JSON.stringify(jsonLd),
          injectTo: "head",
        },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    softwareApplicationJsonLd(),
    mcpPlugin(),
  ].filter(Boolean),
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
        // Split only *leaf* libraries that never call React.createContext() at
        // module-eval time into their own long-term-cacheable chunks. We
        // deliberately DO NOT hand-split the React runtime (react / react-dom /
        // react-router / @tanstack / radix / sonner / form libs): those call
        // React.createContext() at eval time, and forcing them into sibling
        // manual chunks does not guarantee the react chunk initializes first —
        // which white-screens the app with "Cannot read properties of undefined
        // (reading 'createContext')". They stay together in `vendor` so Rollup
        // orders them by dependency internally. The big win is still the
        // per-route React.lazy split in App.tsx, so the public entry never pulls
        // charts / export / heavy pages.
        //
        // The extra vendor-* chunks below are all React-context-free leaves
        // (verified via a per-package diagnostic build): a data client, pure
        // utilities, and icon components. Isolating them keeps them cached
        // across app/react updates and shrinks the shared `vendor` chunk from
        // ~846 kB to ~500 kB.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory|internmap)/.test(id))
            return "vendor-charts";
          if (/[\\/]node_modules[\\/](xlsx|jszip|papaparse|file-saver)[\\/]/.test(id))
            return "vendor-export";
          // @supabase/* is a pure JS data client (auth / realtime / storage /
          // postgrest) — no React, no createContext. ~200 kB, rarely changes.
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          // lucide-react icons render React elements but create no context at
          // eval — safe to isolate. ~48 kB.
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "vendor-icons";
          // Pure, framework-agnostic utilities: schema validation + date math.
          if (/[\\/]node_modules[\\/](zod|date-fns)[\\/]/.test(id)) return "vendor-utils";
          // Everything else (react, react-dom, react-router, @tanstack, radix,
          // sonner, form libs, …) goes in ONE vendor chunk. A single chunk lets
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

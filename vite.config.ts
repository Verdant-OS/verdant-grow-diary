import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import sharp from "sharp";
import { PRICING } from "./src/constants/pricing";
import { VERDANT_CULTIVARS } from "./src/constants/verdantCultivars";
import { viteManualChunks } from "./src/lib/build/manualChunks";
import { FOUNDER_SOCIAL_META } from "./src/constants/founderSocialMeta";
import { buildStaticSocialRouteHtml } from "./src/lib/build/staticSocialRouteHtml";
import { buildCultivarStaticRouteManifest } from "./src/lib/build/cultivarStaticRouteManifest";
import {
  buildCultivarOpenGraphCard,
  buildCultivarOpenGraphSvg,
  CULTIVARS_INDEX_OPEN_GRAPH_CARD,
} from "./src/lib/build/cultivarOpenGraphImage";

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

function staticSocialRouteDocuments(): Plugin {
  return {
    name: "verdant-static-social-route-documents",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const indexAsset = bundle["index.html"];
      if (!indexAsset || indexAsset.type !== "asset" || typeof indexAsset.source !== "string") {
        this.error("Vite did not emit a string index.html asset");
        return;
      }
      this.emitFile({
        type: "asset",
        fileName: "founder.html",
        source: buildStaticSocialRouteHtml(indexAsset.source, FOUNDER_SOCIAL_META),
      });

      const cultivarRoutes = buildCultivarStaticRouteManifest();
      for (const route of cultivarRoutes) {
        this.emitFile({
          type: "asset",
          fileName: route.fileName,
          source: buildStaticSocialRouteHtml(indexAsset.source, route.metadata),
        });
      }

      const cards = [
        { slug: "index", card: CULTIVARS_INDEX_OPEN_GRAPH_CARD },
        ...VERDANT_CULTIVARS.map((cultivar) => ({
          slug: cultivar.slug,
          card: buildCultivarOpenGraphCard(cultivar),
        })),
      ];
      for (const { slug, card } of cards) {
        const png = await sharp(Buffer.from(buildCultivarOpenGraphSvg(card)))
          .png({ compressionLevel: 9, palette: true, quality: 100 })
          .toBuffer();
        this.emitFile({
          type: "asset",
          fileName: `og/cultivars/${slug}.png`,
          source: png,
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "cultivar-seo-manifest.json",
        source: JSON.stringify(
          {
            version: 1,
            routes: cultivarRoutes,
            images: cards.map(({ slug }) => ({
              slug,
              fileName: `og/cultivars/${slug}.png`,
            })),
          },
          null,
          2,
        ),
      });
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
    staticSocialRouteDocuments(),
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
        // Manual chunk classification lives in a pure, unit-tested helper
        // (src/lib/build/manualChunks.ts) so its hard invariant — keep the
        // React-context / eval-order graph together in one `vendor` chunk;
        // only split React-context-free leaf libraries — is guarded by a
        // build-contract test (src/test/vite-manual-chunks-contract.test.ts)
        // rather than a comment alone. See PR #138 for why sibling
        // react/query/radix chunks white-screen the app on 'createContext'.
        manualChunks: viteManualChunks,
      },
    },
  },
}));

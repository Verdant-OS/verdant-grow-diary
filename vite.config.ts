import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { PRICING } from "./src/constants/pricing";
import { viteManualChunks } from "./src/lib/build/manualChunks";
import { buildStaticSocialRouteHtml } from "./src/lib/build/staticSocialRouteHtml";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "./src/lib/build/staticPublicSeoDocuments";
import { buildOgCardSvg, ogImageSlugForPath, OG_IMAGE_WIDTH } from "./src/lib/build/ogImageCard";
import { Resvg } from "@resvg/resvg-js";

const SITE_ORIGIN = "https://verdantgrowdiary.com";

/**
 * Bake a SoftwareApplication + Offer JSON-LD block into index.html at build
 * time. Prices are read from src/constants/pricing.ts (the single source of
 * truth) so the structured data can never drift from the pricing page. Static
 * output means non-JS crawlers see it too — no aggregateRating is emitted
 * because we have no real ratings to cite.
 *
 * Offers list ONLY the plans a grower can buy from the public pricing page
 * today: Free, Pro, and Craft. Founder Lifetime was retired from the public
 * grid (it renders only behind an explicit ?plan=founder_lifetime deep link),
 * so advertising it in structured data would misrepresent availability.
 * Existing founder ENTITLEMENTS are untouched — this is display truth only.
 * src/test/software-application-offers-truth.test.ts pins this contract.
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
        name: "Craft (monthly)",
        price: String(PRICING.craft.monthlyPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Craft (annual)",
        price: String(PRICING.craft.annualPrice),
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
    generateBundle(_options, bundle) {
      const indexAsset = bundle["index.html"];
      if (!indexAsset || indexAsset.type !== "asset" || typeof indexAsset.source !== "string") {
        this.error("Vite did not emit a string index.html asset");
        return;
      }
      const fileNames = new Set<string>();
      const ogEmitted = new Set<string>();
      for (const document of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
        if (fileNames.has(document.fileName)) {
          this.error(`Duplicate static SEO output path: ${document.fileName}`);
          return;
        }
        fileNames.add(document.fileName);

        // Per-route OG PNG. Deterministic filename derived from the URL path.
        const canonicalPath = new URL(document.metadata.url).pathname;
        const slug = ogImageSlugForPath(canonicalPath);
        const ogFileName = `og/${slug}.png`;
        if (!ogEmitted.has(ogFileName)) {
          ogEmitted.add(ogFileName);
          const svg = buildOgCardSvg({
            title: document.metadata.title,
            description: document.metadata.description,
            path: canonicalPath,
          });
          try {
            const png = new Resvg(svg, {
              fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
              font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
            })
              .render()
              .asPng();
            this.emitFile({
              type: "asset",
              fileName: ogFileName,
              source: png,
            });
          } catch (error) {
            this.error(
              `Failed to render OG image for ${document.path}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return;
          }
        }
        const ogImageUrl = `${VERDANT_SITE_ORIGIN}/${ogFileName}`;

        const metadataWithOg = { ...document.metadata, image: ogImageUrl };
        this.emitFile({
          type: "asset",
          fileName: document.fileName,
          source: buildStaticSocialRouteHtml(indexAsset.source, metadataWithOg),
        });
      }

      // Homepage ("/") — served by index.html itself. Emit a per-route OG PNG
      // and rewrite the sitewide og:image + twitter:image + og:image:alt so
      // non-JS crawlers see the same per-route treatment as every other page.
      const homeTitle = "Verdant Grow Diary — Plant memory. Sensor truth.";
      const homeDescription =
        "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";
      const homeSvg = buildOgCardSvg({
        title: homeTitle,
        description: homeDescription,
        path: "/",
      });
      try {
        const homePng = new Resvg(homeSvg, {
          fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
          font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
        })
          .render()
          .asPng();
        this.emitFile({ type: "asset", fileName: "og/home.png", source: homePng });
      } catch (error) {
        this.error(
          `Failed to render home OG image: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
      const homeOgUrl = `${VERDANT_SITE_ORIGIN}/og/home.png`;
      let patchedIndex = indexAsset.source;
      const rewriteMeta = (attr: "name" | "property", key: string, value: string) => {
        const pattern = new RegExp(
          `<meta\\b(?=[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["'])[^>]*>`,
          "i",
        );
        if (!pattern.test(patchedIndex)) {
          this.error(`index.html missing ${attr}="${key}" meta tag`);
          return;
        }
        patchedIndex = patchedIndex.replace(
          pattern,
          `<meta ${attr}="${key}" content="${value.replace(/"/g, "&quot;")}" />`,
        );
      };
      rewriteMeta("property", "og:image", homeOgUrl);
      rewriteMeta("property", "og:image:alt", "Verdant Grow Diary — Plant memory. Sensor truth.");
      rewriteMeta("name", "twitter:image", homeOgUrl);
      indexAsset.source = patchedIndex;

      // Emit a machine-readable manifest of every pre-rendered public route
      // and the exact metadata the plugin baked into its <head>. Postbuild
      // validators (validate-static-route-head-fidelity.mjs) and the sitemap
      // parity vitest use this as the single source of truth, so head
      // fidelity and sitemap membership never drift silently.
      const manifest = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => {
        const slug = ogImageSlugForPath(new URL(document.metadata.url).pathname);
        const ogFileName = `og/${slug}.png`;
        return {
          path: document.path,
          fileName: document.fileName,
          metadata: {
            ...document.metadata,
            image: `${VERDANT_SITE_ORIGIN}/${ogFileName}`,
          },
        };
      });
      this.emitFile({
        type: "asset",
        fileName: "seo-manifest.json",
        source: JSON.stringify({ origin: VERDANT_SITE_ORIGIN, documents: manifest }, null, 2),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Keep local development private by default. `bun run dev:lan` is the
    // explicit opt-in when another device on the grower's LAN needs access.
    host: "127.0.0.1",
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
    // @lovable.dev/mcp-js 0.24.0 externalizes its entry as `npm:C:\...`
    // on Windows, replacing the checked-in portable Edge bundle with a
    // machine-local import. Lovable/CI run on Linux and still regenerate the
    // bundle there; Windows builds retain the already-verified checked-in
    // bundle instead of corrupting it.
    process.platform !== "win32" && mcpPlugin(),
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

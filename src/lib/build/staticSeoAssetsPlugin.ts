import { Resvg } from "@resvg/resvg-js";
import type { Plugin } from "vite";
import { buildOgCardSvg, ogImageSlugForPath, OG_IMAGE_WIDTH } from "./ogImageCard";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "./staticPublicSeoDocuments";

function renderOgPng(title: string, description: string, path: string): Uint8Array {
  const svg = buildOgCardSvg({ title, description, path });
  return new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();
}

/**
 * Emits deterministic social-card assets and the validator manifest into the
 * client build. TanStack prerender owns every HTML document; this plugin never
 * rewrites or emits route HTML.
 */
export function staticSeoAssets(): Plugin {
  return {
    name: "verdant-static-seo-assets",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle() {
      const emitted = new Set<string>();
      const emitRouteImage = (title: string, description: string, canonicalPath: string) => {
        const fileName = `og/${ogImageSlugForPath(canonicalPath)}.png`;
        if (emitted.has(fileName)) return fileName;
        emitted.add(fileName);
        try {
          this.emitFile({
            type: "asset",
            fileName,
            source: renderOgPng(title, description, canonicalPath),
          });
        } catch (error) {
          this.error(
            `Failed to render OG image for ${canonicalPath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return fileName;
      };

      emitRouteImage(
        "Verdant Grow Diary — Plant memory. Sensor truth.",
        "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.",
        "/",
      );

      for (const document of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
        const canonicalPath = new URL(document.metadata.url).pathname;
        emitRouteImage(document.metadata.title, document.metadata.description, canonicalPath);
      }

      const manifest = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => {
        const canonicalPath = new URL(document.metadata.url).pathname;
        const { bodyFallbackHtml: _bodyFallbackHtml, ...metadata } = document.metadata;
        return {
          path: document.path,
          fileName: document.fileName,
          metadata: {
            ...metadata,
            image: `${VERDANT_SITE_ORIGIN}/og/${ogImageSlugForPath(canonicalPath)}.png`,
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

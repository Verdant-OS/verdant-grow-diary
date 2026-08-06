#!/usr/bin/env bun
/**
 * generate-seo-artifacts
 *
 * Emits the two build artifacts the public-SEO validators consume:
 *
 *   - dist/client/og/<slug>.png  — per-route Open Graph card (served)
 *   - dist/seo-manifest.json     — machine-readable list of every public
 *                                  document and the exact <head> metadata it
 *                                  must expose (NOT served; dist/client is the
 *                                  public dir, so nothing here can shadow an
 *                                  SSR route)
 *
 * Under the old SPA build these were emitted by the `staticSocialRouteDocuments`
 * vite plugin, which patched Vite's single index.html shell. That shell no
 * longer exists under SSR, so the manifest is now derived directly from
 * `STATIC_PUBLIC_OUTPUT_DOCUMENTS` (the same source of truth the plugin used)
 * and the documents it is checked against are real SSR responses captured by
 * `scripts/capture-ssr-head-snapshots.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "../src/lib/build/staticPublicSeoDocuments";
import { resolveStaticDocumentMetadata } from "../src/lib/build/staticRouteHead";
import { buildOgCardSvg, ogImageSlugForPath, OG_IMAGE_WIDTH } from "../src/lib/build/ogImageCard";

const distDir = resolve(process.argv[2] ?? "dist");
const clientDir = join(distDir, "client");

function renderPng(title: string, description: string, path: string): Buffer {
  const svg = buildOgCardSvg({ title, description, path });
  return new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();
}

function writeFile(filePath: string, contents: Buffer | string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

const emittedOg = new Set<string>();
const documents = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => {
  const canonicalPath = new URL(document.metadata.url).pathname;
  const ogFileName = `og/${ogImageSlugForPath(canonicalPath)}.png`;
  if (!emittedOg.has(ogFileName)) {
    emittedOg.add(ogFileName);
    writeFile(
      join(clientDir, ogFileName),
      renderPng(document.metadata.title, document.metadata.description, canonicalPath),
    );
  }
  return {
    path: document.path,
    fileName: document.fileName,
    metadata: resolveStaticDocumentMetadata(document),
  };
});

// Homepage card — "/" is served by the root route, not by a document entry.
writeFile(
  join(clientDir, "og/home.png"),
  renderPng(
    "Verdant Grow Diary — Plant memory. Sensor truth.",
    "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.",
    "/",
  ),
);

writeFile(
  join(distDir, "seo-manifest.json"),
  `${JSON.stringify({ origin: VERDANT_SITE_ORIGIN, documents }, null, 2)}\n`,
);

console.log(
  `generate-seo-artifacts: ${documents.length} documents, ${emittedOg.size + 1} OG cards -> ${distDir}`,
);

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { VERDANT_CULTIVAR_SLUGS } from "@/constants/verdantCultivars";
import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(process.cwd());
const VERCEL = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  cleanUrls?: boolean;
  redirects?: Array<{ source?: string; destination?: string; permanent?: boolean }>;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("static public SEO documents", () => {
  it("pre-renders every public acquisition hub, guide, and cultivar route", () => {
    const paths = new Set(STATIC_PUBLIC_SEO_DOCUMENTS.map((document) => document.path));

    for (const required of [
      "/founder",
      "/welcome",
      "/pricing",
      "/guides",
      "/guides/grow-stage-care-guide",
      "/cultivars",
      "/tools/vpd-calculator",
      "/hardware-integrations",
      "/how-ai-doctor-works",
    ]) {
      expect(paths).toContain(required);
    }
    for (const slug of VERDANT_GUIDE_SLUGS) {
      expect(paths).toContain(`/guides/${slug}`);
    }
    for (const slug of VERDANT_CULTIVAR_SLUGS) {
      expect(paths).toContain(`/cultivars/${slug}`);
    }
  });

  it("emits deterministic route-local documents with canonical, crawlable metadata", () => {
    const outputPaths = new Set<string>();
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(outputPaths.has(document.fileName)).toBe(false);
      outputPaths.add(document.fileName);
      expect(document.fileName).toBe(
        document.path === "/founder" ? "founder.html" : `${document.path.slice(1)}.html`,
      );
      expect(document.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${document.path}`);
      expect(document.metadata.url).not.toMatch(/[?#]/);
      expect(document.metadata.title).toBeTruthy();
      expect(document.metadata.description).toBeTruthy();
      expect(document.metadata.image).toMatch(/^https:\/\//);
      expect(document.metadata.robots ?? "index, follow").toBe("index, follow");
    }

    const cultivarCanonical = STATIC_PUBLIC_SEO_DOCUMENTS.find(
      (document) => document.path === "/cultivars",
    )?.metadata.url;
    for (const filterVariant of ["?q=oreoz", "?difficulty=Advanced", "?q=oreoz&difficulty=Advanced"]) {
      const requestUrl = new URL(`/cultivars${filterVariant}`, VERDANT_SITE_ORIGIN);
      expect(cultivarCanonical).toBe(`${VERDANT_SITE_ORIGIN}${requestUrl.pathname}`);
      expect(new URL(cultivarCanonical ?? "", VERDANT_SITE_ORIGIN).search).toBe("");
    }
  });

  it("serves static public documents with clean URLs before the SPA fallback and redirects legacy strain aliases", () => {
    expect(VERCEL.cleanUrls).toBe(true);
    const spaFallbackIndex = VERCEL.rewrites?.findIndex(
      (rewrite) => rewrite.destination === "/",
    );
    expect(spaFallbackIndex).toBe(0);

    expect(VERCEL.redirects).toEqual(
      expect.arrayContaining([
        { source: "/strains", destination: "/cultivars", permanent: true },
        { source: "/strains/:slug", destination: "/cultivars/:slug", permanent: true },
      ]),
    );
  });
});

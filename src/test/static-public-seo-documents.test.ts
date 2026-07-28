import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { VERDANT_CULTIVAR_SLUGS } from "@/constants/verdantCultivars";
import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import {
  STATIC_PUBLIC_ALIAS_DOCUMENTS,
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
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
      "/feedback",
      "/contact",
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

  it("emits legacy strain aliases as noindex documents owned by cultivar canonicals", () => {
    expect(STATIC_PUBLIC_ALIAS_DOCUMENTS.length).toBe(VERDANT_CULTIVAR_SLUGS.length + 1);

    const aliasesByPath = new Map(
      STATIC_PUBLIC_ALIAS_DOCUMENTS.map((document) => [document.path, document]),
    );
    const hub = aliasesByPath.get("/strains");
    expect(hub).toMatchObject({
      canonicalPath: "/cultivars",
      fileName: "strains/index.html",
      metadata: {
        url: `${VERDANT_SITE_ORIGIN}/cultivars`,
        robots: "noindex, follow",
      },
    });

    for (const slug of VERDANT_CULTIVAR_SLUGS) {
      expect(aliasesByPath.get(`/strains/${slug}`)).toMatchObject({
        canonicalPath: `/cultivars/${slug}`,
        fileName: `strains/${slug}/index.html`,
        metadata: {
          url: `${VERDANT_SITE_ORIGIN}/cultivars/${slug}`,
          robots: "noindex, follow",
        },
      });
    }
  });

  it("keeps every emitted filesystem path unique and query-free", () => {
    const paths = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path);
    const fileNames = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.fileName);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(fileNames).size).toBe(fileNames.length);
    for (const document of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      expect(document.path).not.toMatch(/[?#]/);
      expect(document.fileName).toBe(`${document.path.slice(1)}/index.html`);
    }
  });

  it("emits deterministic route-local documents with canonical, crawlable metadata", () => {
    const outputPaths = new Set<string>();
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(outputPaths.has(document.fileName)).toBe(false);
      outputPaths.add(document.fileName);
      expect(document.fileName).toBe(`${document.path.slice(1)}/index.html`);
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
    for (const filterVariant of [
      "?q=oreoz",
      "?difficulty=Advanced",
      "?q=oreoz&difficulty=Advanced",
    ]) {
      const requestUrl = new URL(`/cultivars${filterVariant}`, VERDANT_SITE_ORIGIN);
      expect(cultivarCanonical).toBe(`${VERDANT_SITE_ORIGIN}${requestUrl.pathname}`);
      expect(new URL(cultivarCanonical ?? "", VERDANT_SITE_ORIGIN).search).toBe("");
    }
  });

  it("uses directory-local documents that filesystem-first hosts serve before the SPA fallback", () => {
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(document.fileName).toBe(`${document.path.slice(1)}/index.html`);
    }

    expect(VERCEL.cleanUrls).toBe(true);
    const spaFallbackIndex = VERCEL.rewrites?.findIndex((rewrite) => rewrite.destination === "/");
    expect(spaFallbackIndex).toBe(0);

    expect(VERCEL.redirects).toEqual(
      expect.arrayContaining([
        { source: "/strains", destination: "/cultivars", permanent: true },
        { source: "/strains/:slug", destination: "/cultivars/:slug", permanent: true },
      ]),
    );
  });
});

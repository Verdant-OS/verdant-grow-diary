import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { VERDANT_CULTIVAR_SLUGS } from "@/constants/verdantCultivars";
import { VERDANT_GUIDE_SLUGS } from "@/constants/verdantSeoContent";
import {
  STATIC_PUBLIC_ALIAS_DOCUMENTS,
  STATIC_PUBLIC_NOINDEX_DOCUMENTS,
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
  OREOZ_GELONADE_CUSTOMER_SEO,
} from "@/constants/oreozGelonadeExperience";

const ROOT = resolve(process.cwd());
const VERCEL = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  cleanUrls?: boolean;
  redirects?: Array<{ source?: string; destination?: string; permanent?: boolean }>;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("static public SEO documents", () => {
  const expectedFileName = (path: string) =>
    path === "/" ? "index.html" : `${path.slice(1)}/index.html`;

  it("pre-renders every public acquisition hub, guide, and cultivar route", () => {
    const paths = new Set(STATIC_PUBLIC_SEO_DOCUMENTS.map((document) => document.path));

    for (const required of [
      "/",
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

  it("emits the ID-free Customer Mode guide as noindex and keeps it out of acquisition docs", () => {
    expect(STATIC_PUBLIC_NOINDEX_DOCUMENTS).toEqual([
      expect.objectContaining({
        path: NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
        fileName: "customer/guide/oreoz-vs-gelonade-comparison/index.html",
        metadata: expect.objectContaining({
          title: OREOZ_GELONADE_CUSTOMER_SEO.title,
          description: OREOZ_GELONADE_CUSTOMER_SEO.description,
          url: `${VERDANT_SITE_ORIGIN}${NEXT_DOOR_CUSTOMER_COMPARISON_PATH}`,
          robots: "noindex, follow",
        }),
      }),
    ]);
    expect(
      STATIC_PUBLIC_SEO_DOCUMENTS.some(
        (document) => document.path === NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
      ),
    ).toBe(false);
    expect(
      STATIC_PUBLIC_OUTPUT_DOCUMENTS.some(
        (document) => document.path === NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
      ),
    ).toBe(true);
  });

  it("keeps every emitted filesystem path unique and query-free", () => {
    const paths = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path);
    const fileNames = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.fileName);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(fileNames).size).toBe(fileNames.length);
    for (const document of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      expect(document.path).not.toMatch(/[?#]/);
      expect(document.fileName).toBe(expectedFileName(document.path));
    }
  });

  it("emits deterministic route-local documents with canonical, crawlable metadata", () => {
    const outputPaths = new Set<string>();
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(outputPaths.has(document.fileName)).toBe(false);
      outputPaths.add(document.fileName);
      expect(document.fileName).toBe(expectedFileName(document.path));
      // Self-canonical is the rule. The single sanctioned exception is a
      // document that DECLARES a `canonicalPath` — an indexable audience
      // variant conceding its ranking URL to another route (see
      // crossCanonicalDocument and src/test/breeder-beta-cross-canonical.test.ts).
      // The fence is not loosened, only redirected: such a document must match
      // its declared target exactly, so a wrong URL still fails here and can
      // only be introduced deliberately.
      const declaredCanonical = (document as { canonicalPath?: string }).canonicalPath;
      expect(document.metadata.url).toBe(
        `${VERDANT_SITE_ORIGIN}${declaredCanonical ?? document.path}`,
      );
      expect(document.metadata.url).not.toMatch(/[?#]/);
      expect(document.metadata.title).toBeTruthy();
      expect(document.metadata.description).toBeTruthy();
      expect(document.metadata.image).toMatch(/^https:\/\//);
      expect(document.metadata.jsonLd).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            "@type": "WebPage",
            "@id": `${document.metadata.url}#webpage`,
          }),
        ]),
      );
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

  it("provides route-specific WebPage JSON-LD for non-JavaScript crawlers", () => {
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      const page = document.metadata.jsonLd?.find(
        (block): block is { "@type"?: unknown; "@id"?: unknown; url?: unknown } =>
          typeof block === "object" && block !== null && "@type" in block,
      );
      expect(page).toMatchObject({
        "@type": "WebPage",
        "@id": `${document.metadata.url}#webpage`,
        url: document.metadata.url,
      });
    }
  });

  it("keeps rich page schema available in the static crawler documents", () => {
    const byPath = new Map(
      STATIC_PUBLIC_SEO_DOCUMENTS.map((document) => [document.path, document]),
    );
    const typesAt = (path: string) =>
      (byPath.get(path)?.metadata.jsonLd ?? []).flatMap((block) => {
        if (typeof block !== "object" || block === null || !("@type" in block)) return [];
        const type = (block as { "@type"?: unknown })["@type"];
        return typeof type === "string" ? [type] : [];
      });

    expect(typesAt("/guides")).toEqual(
      expect.arrayContaining(["WebPage", "FAQPage", "BreadcrumbList"]),
    );
    expect(typesAt("/guides/what-to-log-in-a-grow-journal")).toEqual(
      expect.arrayContaining(["WebPage", "FAQPage", "BreadcrumbList"]),
    );
    expect(typesAt("/guides/what-to-log-in-a-grow-journal")).not.toContain("Article");
    expect(typesAt("/guides/cannabis-grow-light-distance-and-schedule")).toEqual(
      expect.arrayContaining(["WebPage", "FAQPage", "BreadcrumbList", "Article"]),
    );
    expect(typesAt("/cultivars/oreoz")).toEqual(
      expect.arrayContaining(["WebPage", "CollectionPage", "FAQPage", "BreadcrumbList", "Article"]),
    );
    expect(typesAt("/quick-log")).toEqual(
      expect.arrayContaining(["WebPage", "SoftwareApplication", "FAQPage"]),
    );
  });

  it("uses directory-local documents that filesystem-first hosts serve before the SPA fallback", () => {
    for (const document of STATIC_PUBLIC_SEO_DOCUMENTS) {
      expect(document.fileName).toBe(expectedFileName(document.path));
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

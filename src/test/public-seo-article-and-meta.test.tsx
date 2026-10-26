import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildArticleJsonLd } from "@/lib/seoStructuredData";

const META_DESCRIPTION_LIMIT = 160;

function Probe({ path }: { path: string }) {
  usePageSeo({
    title: "Query | Verdant Grow Diary",
    description: "Parameter URLs keep a clean canonical.",
    path,
  });
  return null;
}

afterEach(() => cleanup());

describe("public SEO audit fixes", () => {
  it("emits Article JSON-LD for every guide, with dates only when the source has them", () => {
    for (const guide of VERDANT_SEO_GUIDES) {
      const document = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find(
        (entry) => entry.path === `/guides/${guide.slug}`,
      );
      const article = document?.metadata.jsonLd?.find(
        (block) =>
          typeof block === "object" &&
          block !== null &&
          "@type" in block &&
          (block as { "@type"?: string })["@type"] === "Article",
      ) as {
        headline?: string;
        description?: string;
        url?: string;
        datePublished?: string;
        dateModified?: string;
        author?: { "@type"?: string; name?: string };
        publisher?: { "@type"?: string; name?: string; logo?: { "@type"?: string; url?: string } };
        image?: string;
      };
      expect(article, guide.slug).toBeTruthy();
      expect(article.headline).toBe(guide.h1);
      expect(article.description).toBe(guide.description);
      expect(article.url).toBe(`${VERDANT_SITE_ORIGIN}/guides/${guide.slug}`);
      expect(article.author).toMatchObject({ "@type": "Organization", name: "Verdant Grow Diary" });
      expect(article.publisher).toMatchObject({
        "@type": "Organization",
        name: "Verdant Grow Diary",
        logo: {
          "@type": "ImageObject",
          url: `${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`,
        },
      });
      expect(article.image).toBe(`${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`);
      if (guide.publishedOn) expect(article.datePublished).toBe(guide.publishedOn);
      else expect(article.datePublished).toBeUndefined();
      if (guide.modifiedOn) expect(article.dateModified).toBe(guide.modifiedOn);
      else expect(article.dateModified).toBeUndefined();
    }
  });

  it("keeps indexable public meta descriptions within 160 characters", () => {
    const tooLong = STATIC_PUBLIC_OUTPUT_DOCUMENTS.filter((document) => {
      const robots = document.metadata.robots ?? "index, follow";
      return (
        !robots.includes("noindex") && document.metadata.description.length > META_DESCRIPTION_LIMIT
      );
    }).map((document) => `${document.path} (${document.metadata.description.length})`);
    expect(tooLong).toEqual([]);
  });

  it("omits a publication date the builder was not given", () => {
    const article = buildArticleJsonLd({
      headline: "Undated guide",
      description: "No repository publication date.",
      url: "https://verdantgrowdiary.com/guides/undated",
    });
    expect(article.datePublished).toBeUndefined();
    expect(article.publisher.logo.url).toMatch(/^https:\/\//);
  });

  it("canonicalizes a parameter URL to the path", () => {
    render(<Probe path="/quick-log?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a" />);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://verdantgrowdiary.com/quick-log",
    );
  });
});

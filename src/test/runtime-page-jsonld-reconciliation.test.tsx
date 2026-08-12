import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_SEO_GUIDES,
  VERDANT_SITE_ORIGIN,
} from "@/constants/verdantSeoContent";
import { buildCultivarFaqItems } from "@/lib/cultivarDetailSeo";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  type StaticPublicSeoDocument,
} from "@/lib/build/staticPublicSeoDocuments";
import { mountRuntimePageJsonLd } from "@/lib/runtimePageJsonLd";
import { buildFaqPageJsonLd, safeJsonLdStringify } from "@/lib/seoStructuredData";
import CultivarPage from "@/pages/CultivarPage";
import GuidePage from "@/pages/GuidePage";
import GuidesIndex from "@/pages/GuidesIndex";

type JsonLdNode = Record<string, unknown>;

function clearRouteHead(): void {
  document.head
    .querySelectorAll(
      'script[type="application/ld+json"], link[rel="canonical"], meta[data-page-seo]',
    )
    .forEach((node) => node.remove());
}

afterEach(() => {
  cleanup();
  clearRouteHead();
});

function staticDocument(path: string): StaticPublicSeoDocument {
  const found = STATIC_PUBLIC_SEO_DOCUMENTS.find((document) => document.path === path);
  if (!found) throw new Error(`Missing static SEO document for ${path}`);
  return found;
}

function seedStaticJsonLd(path: string): ReadonlyArray<string> {
  const values = staticDocument(path).metadata.jsonLd ?? [];
  return values.map((value) => {
    const raw = safeJsonLdStringify(value);
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-static-route-ldjson", "true");
    script.textContent = raw;
    document.head.appendChild(script);
    return raw;
  });
}

function parsedJsonLd(): unknown[] {
  return Array.from(
    document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  ).flatMap((script) => {
    try {
      return [JSON.parse(script.textContent ?? "") as unknown];
    } catch {
      return [];
    }
  });
}

function topLevelNodes(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) return value.flatMap(topLevelNodes);
  if (typeof value !== "object" || value === null) return [];
  const node = value as JsonLdNode;
  const graph = Array.isArray(node["@graph"]) ? node["@graph"].flatMap(topLevelNodes) : [];
  return [...("@type" in node ? [node] : []), ...graph];
}

function nodesOfType(type: string): JsonLdNode[] {
  return parsedJsonLd()
    .flatMap(topLevelNodes)
    .filter((node) => {
      const rawType = node["@type"];
      return rawType === type || (Array.isArray(rawType) && rawType.includes(type));
    });
}

function collectAllTypes(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAllTypes(item, into));
    return into;
  }
  if (typeof value !== "object" || value === null) return into;
  for (const [key, child] of Object.entries(value)) {
    if (key === "@type") {
      if (typeof child === "string") into.add(child);
      if (Array.isArray(child)) {
        child.forEach((type) => {
          if (typeof type === "string") into.add(type);
        });
      }
    }
    collectAllTypes(child, into);
  }
  return into;
}

function expectNoCommerceSchema(): void {
  const types = collectAllTypes(parsedJsonLd());
  expect(types.has("Product")).toBe(false);
  expect(types.has("Offer")).toBe(false);
  expect(types.has("AggregateOffer")).toBe(false);
}

function expectCanonicalFaq(expected: ReturnType<typeof buildFaqPageJsonLd>): void {
  const faqNodes = nodesOfType("FAQPage");
  expect(faqNodes).toHaveLength(1);
  expect(faqNodes[0]).toEqual(expected);
  expect(faqNodes[0].url).toBe(
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
  );
}

function visibleAccordionQuestions(): string[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-controls]")).map(
    (button) => button.textContent?.trim() ?? "",
  );
}

function renderGuides(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderCultivar(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/cultivars/${slug}`]}>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
        <Route path="/cultivars" element={<div>Index fallback</div>} />
        <Route path="/auth" element={<div>Auth</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function SpaNavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <div>
        <button type="button" onClick={() => navigate("/guides")}>
          Go to guide hub
        </button>
        <button
          type="button"
          onClick={() => navigate("/guides/cannabis-grow-light-distance-and-schedule")}
        >
          Go to dated guide
        </button>
        <button type="button" onClick={() => navigate("/guides/grow-diary-app")}>
          Go to undated guide
        </button>
      </div>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="/cultivars" element={<div>Index fallback</div>} />
        <Route path="/auth" element={<div>Auth</div>} />
      </Routes>
    </>
  );
}

const GUIDE_FAQ_ROUTES = [
  {
    path: "/guides",
    questions: VERDANT_GROWER_GUIDE_FAQ,
    expectedArticleCount: 0,
  },
  ...VERDANT_SEO_GUIDES.map((guide) => ({
    path: `/guides/${guide.slug}`,
    questions: guide.faq,
    expectedArticleCount: guide.publishedOn ? 1 : 0,
  })),
];

describe("runtime route JSON-LD ownership", () => {
  it("preserves complementary static graph nodes and malformed blocks while replacing owned types", () => {
    const staticGraph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", url: `${VERDANT_SITE_ORIGIN}/guides` },
        { "@type": "FAQPage", url: "https://stale.example/guides", mainEntity: [] },
        { "@type": "BreadcrumbList", itemListElement: [] },
        { "@type": "Article", headline: "Stale article" },
      ],
    };
    const graphScript = document.createElement("script");
    graphScript.type = "application/ld+json";
    graphScript.setAttribute("data-static-route-ldjson", "true");
    graphScript.textContent = JSON.stringify(staticGraph);
    document.head.appendChild(graphScript);

    const malformedScript = document.createElement("script");
    malformedScript.type = "application/ld+json";
    malformedScript.setAttribute("data-static-route-ldjson", "true");
    malformedScript.textContent = "{not-json";
    document.head.appendChild(malformedScript);

    // Static route payloads remain byte-for-byte untouched before hydration.
    expect(graphScript.textContent).toBe(JSON.stringify(staticGraph));
    expect(malformedScript.textContent).toBe("{not-json");

    const runtimeFaq = buildFaqPageJsonLd({
      pageUrl: `${VERDANT_SITE_ORIGIN}/guides`,
      questions: VERDANT_GROWER_GUIDE_FAQ,
    });
    const removeRuntime = mountRuntimePageJsonLd({
      ownedStaticTypes: ["FAQPage", "BreadcrumbList", "Article"],
      documents: [{ marker: "test-faq", value: runtimeFaq }],
    });

    expect(nodesOfType("WebPage")).toHaveLength(1);
    expect(nodesOfType("FAQPage")).toEqual([runtimeFaq]);
    expect(nodesOfType("BreadcrumbList")).toHaveLength(0);
    expect(nodesOfType("Article")).toHaveLength(0);
    expect(malformedScript.textContent).toBe("{not-json");

    removeRuntime();
    expect(document.head.querySelectorAll("script[data-page-ldjson]")).toHaveLength(0);
    expect(nodesOfType("WebPage")).toHaveLength(1);
    expect(malformedScript.isConnected).toBe(true);
  });

  it("removes prior runtime and stale static route types across SPA navigation", () => {
    seedStaticJsonLd("/cultivars/oreoz");
    render(
      <MemoryRouter initialEntries={["/cultivars/oreoz"]}>
        <SpaNavigationHarness />
      </MemoryRouter>,
    );

    expect(nodesOfType("CollectionPage")).toHaveLength(1);
    expect(nodesOfType("FAQPage")).toHaveLength(1);
    expect(nodesOfType("Article")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Go to guide hub" }));
    expectCanonicalFaq(
      buildFaqPageJsonLd({
        pageUrl: `${VERDANT_SITE_ORIGIN}/guides`,
        questions: VERDANT_GROWER_GUIDE_FAQ,
      }),
    );
    expect(nodesOfType("CollectionPage")).toHaveLength(0);
    expect(nodesOfType("Article")).toHaveLength(0);

    const datedGuide = VERDANT_SEO_GUIDES.find(
      (guide) => guide.slug === "cannabis-grow-light-distance-and-schedule",
    )!;
    fireEvent.click(screen.getByRole("button", { name: "Go to dated guide" }));
    expectCanonicalFaq(
      buildFaqPageJsonLd({
        pageUrl: `${VERDANT_SITE_ORIGIN}/guides/${datedGuide.slug}`,
        questions: datedGuide.faq,
      }),
    );
    expect(nodesOfType("Article")).toHaveLength(1);

    const undatedGuide = VERDANT_SEO_GUIDES.find((guide) => guide.slug === "grow-diary-app")!;
    fireEvent.click(screen.getByRole("button", { name: "Go to undated guide" }));
    expectCanonicalFaq(
      buildFaqPageJsonLd({
        pageUrl: `${VERDANT_SITE_ORIGIN}/guides/${undatedGuide.slug}`,
        questions: undatedGuide.faq,
      }),
    );
    expect(nodesOfType("Article")).toHaveLength(0);
    expect(nodesOfType("BreadcrumbList")).toHaveLength(1);
    expect(nodesOfType("WebPage")).toHaveLength(1);
    expectNoCommerceSchema();
  });

  it("reconciles all 10 cultivar static documents and hydrated pages to one truthful FAQ", () => {
    expect(VERDANT_CULTIVARS).toHaveLength(10);

    for (const cultivar of VERDANT_CULTIVARS) {
      const path = `/cultivars/${cultivar.slug}`;
      const url = `${VERDANT_SITE_ORIGIN}${path}`;
      const expectedItems = buildCultivarFaqItems(cultivar);
      const expectedFaq = buildFaqPageJsonLd({
        pageUrl: url,
        questions: expectedItems,
      });
      const rawStaticBlocks = seedStaticJsonLd(path);

      expect(nodesOfType("FAQPage")).toEqual([expectedFaq]);
      expect(
        Array.from(
          document.head.querySelectorAll<HTMLScriptElement>("script[data-static-route-ldjson]"),
        ).map((script) => script.textContent),
      ).toEqual(rawStaticBlocks);
      expectNoCommerceSchema();

      renderCultivar(cultivar.slug);

      expectCanonicalFaq(expectedFaq);
      expect(nodesOfType("WebPage")).toHaveLength(1);
      expect(nodesOfType("CollectionPage")).toHaveLength(1);
      expect(nodesOfType("BreadcrumbList")).toHaveLength(1);
      expect(nodesOfType("Article")).toHaveLength(1);
      expectNoCommerceSchema();

      const visibleItems = screen.getAllByTestId("cultivar-faq-item").map((item) => ({
        question: item.querySelector("dt")?.textContent ?? "",
        answer: item.querySelector("dd")?.textContent ?? "",
      }));
      expect(visibleItems).toEqual(expectedItems);
      expect(
        (
          nodesOfType("FAQPage")[0].mainEntity as Array<{
            name: string;
            acceptedAnswer: { text: string };
          }>
        ).map((item) => ({
          question: item.name,
          answer: item.acceptedAnswer.text,
        })),
      ).toEqual(visibleItems);

      cleanup();
      clearRouteHead();
    }
  });

  it.each(GUIDE_FAQ_ROUTES)(
    "reconciles $path static and hydrated schema to one truthful FAQ",
    (route) => {
      const url = `${VERDANT_SITE_ORIGIN}${route.path}`;
      const expectedFaq = buildFaqPageJsonLd({
        pageUrl: url,
        questions: route.questions,
      });
      const rawStaticBlocks = seedStaticJsonLd(route.path);

      expect(nodesOfType("FAQPage")).toEqual([expectedFaq]);
      expect(
        Array.from(
          document.head.querySelectorAll<HTMLScriptElement>("script[data-static-route-ldjson]"),
        ).map((script) => script.textContent),
      ).toEqual(rawStaticBlocks);
      expectNoCommerceSchema();

      renderGuides(route.path);

      expectCanonicalFaq(expectedFaq);
      expect(nodesOfType("WebPage")).toHaveLength(1);
      expect(nodesOfType("BreadcrumbList")).toHaveLength(1);
      expect(nodesOfType("Article")).toHaveLength(route.expectedArticleCount);
      expect(visibleAccordionQuestions()).toEqual(
        route.questions.map((question) => question.question),
      );
      expectNoCommerceSchema();

      // The schema answers are the same copy rendered by each accordion.
      for (const question of route.questions) {
        fireEvent.click(screen.getByRole("button", { name: question.question }));
        expect(screen.getByText(question.answer)).toBeTruthy();
      }
    },
  );
});

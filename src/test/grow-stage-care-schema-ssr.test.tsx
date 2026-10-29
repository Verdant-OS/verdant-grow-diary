/**
 * /guides/grow-stage-care-guide must ship its FAQPage and BreadcrumbList
 * JSON-LD in the route's first (SSR) response, not from a client useEffect.
 * Asserts on the resolved route head and the real page component.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { GROW_STAGE_CARE_FAQ } from "@/constants/growStageCareGuide";
import { VERDANT_GUIDES_BREADCRUMB_ITEMS } from "@/constants/verdantSeoContent";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GrowStageCareGuide from "@/pages/GrowStageCareGuide";

const PATH = "/guides/grow-stage-care-guide";
const URL = `https://verdantgrowdiary.com${PATH}`;

type JsonLdNode = Record<string, unknown> & { "@type"?: string | string[] };

function headNodes(): JsonLdNode[] {
  return staticRouteHead(PATH)
    .scripts.filter((script) => script.type === "application/ld+json")
    .map((script) => JSON.parse(script.children) as JsonLdNode);
}

function typesOf(node: JsonLdNode): string[] {
  const type = node["@type"];
  return Array.isArray(type) ? type : type ? [type] : [];
}

function ofType(nodes: JsonLdNode[], type: string): JsonLdNode[] {
  return nodes.filter((node) => typesOf(node).includes(type));
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
});

describe("grow-stage care guide schema in the SSR route head", () => {
  it("emits exactly one FAQPage whose Q/A pairs equal GROW_STAGE_CARE_FAQ", () => {
    const faqs = ofType(headNodes(), "FAQPage");
    expect(faqs).toHaveLength(1);
    const entities = faqs[0].mainEntity as Array<{
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }>;
    expect(entities.map((q) => q["@type"])).toEqual(GROW_STAGE_CARE_FAQ.map(() => "Question"));
    expect(entities.map((q) => q.acceptedAnswer["@type"])).toEqual(
      GROW_STAGE_CARE_FAQ.map(() => "Answer"),
    );
    expect(entities.map((q) => ({ question: q.name, answer: q.acceptedAnswer.text }))).toEqual(
      GROW_STAGE_CARE_FAQ.map(({ question, answer }) => ({ question, answer })),
    );
  });

  it("emits exactly one BreadcrumbList matching the guides hierarchy plus this page", () => {
    const crumbs = ofType(headNodes(), "BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    const items = crumbs[0].itemListElement as Array<{
      position: number;
      name: string;
      item: string;
    }>;
    const expected = [
      ...VERDANT_GUIDES_BREADCRUMB_ITEMS,
      { name: "Grow stage care guide", url: URL },
    ];
    expect(items.map((i) => ({ position: i.position, name: i.name, item: i.item }))).toEqual(
      expected.map((e, index) => ({ position: index + 1, name: e.name, item: e.url })),
    );
  });

  it("keeps one WebPage and one self-canonical", () => {
    const head = staticRouteHead(PATH);
    expect(ofType(headNodes(), "WebPage")).toHaveLength(1);
    const canonicals = head.links.filter((link) => link.rel === "canonical");
    expect(canonicals).toEqual([{ rel: "canonical", href: URL }]);
  });

  it("emits one Article and no invented datePublished or dateModified", () => {
    const nodes = headNodes();
    expect(ofType(nodes, "Article")).toHaveLength(1);
    for (const type of ["NewsArticle", "BlogPosting"]) {
      expect(ofType(nodes, type)).toHaveLength(0);
    }
    const serialized = JSON.stringify(nodes);
    expect(serialized).not.toContain("datePublished");
    expect(serialized).not.toContain("dateModified");
  });
});

describe("grow-stage care guide page component", () => {
  it("does not inject its own FAQPage or BreadcrumbList script on mount", () => {
    render(
      <MemoryRouter initialEntries={[PATH]}>
        <GrowStageCareGuide />
      </MemoryRouter>,
    );
    const injected = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    ).flatMap((script) => {
      const parsed = JSON.parse(script.text || "{}") as JsonLdNode | JsonLdNode[];
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    expect(ofType(injected, "FAQPage")).toHaveLength(0);
    expect(ofType(injected, "BreadcrumbList")).toHaveLength(0);
  });
});

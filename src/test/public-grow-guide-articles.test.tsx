import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  ISOLATE_MALE_GUIDE,
  PUBLIC_GROW_GUIDE_ARTICLES,
  PUBLIC_GROW_GUIDE_LEGAL_LINE,
  STILL_AIR_BOX_GUIDE,
  TISSUE_CULTURE_GUIDE,
  type PublicGrowGuideArticle as Article,
} from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

function renderGuide(guide: Article) {
  return render(
    <MemoryRouter>
      <PublicGrowGuideArticle guide={guide} />
    </MemoryRouter>,
  );
}

function documentFor(guide: Article) {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((entry) => entry.path === guide.path);
  if (!doc) throw new Error(`missing static document for ${guide.path}`);
  return doc;
}

const hrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");

function allCopy(guide: Article): string {
  return [
    guide.title,
    guide.h1,
    guide.description,
    guide.intro,
    guide.quickAnswer,
    ...guide.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]),
    ...guide.faq.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(PUBLIC_GROW_GUIDE_ARTICLES)("public guide $path", (guide) => {
  it("renders the H1, every FAQ entry and three signup CTAs with the exact UTM href", () => {
    const { container } = renderGuide(guide);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(guide.h1);
    for (const entry of guide.faq) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
      expect(screen.getByText(entry.answer)).toBeInTheDocument();
    }
    expect(guide.ctaHref).toBe(
      `/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=${guide.slug}`,
    );
    expect(hrefs(container).filter((h) => h === guide.ctaHref)).toHaveLength(3);
    expect(screen.getByText(PUBLIC_GROW_GUIDE_LEGAL_LINE)).toBeInTheDocument();
  });

  it("makes no network or storage calls while rendering", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    renderGuide(guide);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it("states no Celsius values, prices or ratings", () => {
    const copy = allCopy(guide);
    expect(copy).not.toMatch(/°C|\bcelsius\b/i);
    expect(copy).not.toMatch(/[$€£]\s?\d/);
    expect(copy).not.toMatch(/\b\d(\.\d)?\s?(\/|out of)\s?(5|10)\b|★/);
  });

  it("is a public manifest route with an indexable static document", () => {
    expect(APP_ROUTES.find((r) => r.path === guide.path)?.access).toBe("public");
    const doc = documentFor(guide);
    expect(doc.metadata.url).toBe(`https://verdantgrowdiary.com${guide.path}`);
    expect(doc.metadata.title).toBe(`${guide.title} | Verdant Grow Diary`);
    expect(doc.metadata.description).toBe(guide.description);
    expect(doc.metadata.robots ?? "index, follow").toBe("index, follow");
  });

  it("emits WebPage, Article, FAQPage and BreadcrumbList whose FAQ matches the visible FAQ", () => {
    const jsonLd = documentFor(guide).metadata.jsonLd as ReadonlyArray<Record<string, unknown>>;
    expect(jsonLd.map((node) => node["@type"])).toEqual([
      "WebPage",
      "Article",
      "FAQPage",
      "BreadcrumbList",
    ]);
    const faqNode = jsonLd[2] as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(faqNode.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      guide.faq.map((f) => [f.question, f.answer]),
    );
    const crumbs = (jsonLd[3] as { itemListElement: Array<{ name: string; item: string }> })
      .itemListElement;
    expect(crumbs.at(-1)).toMatchObject({
      name: guide.breadcrumbName,
      item: `https://verdantgrowdiary.com${guide.path}`,
    });
  });

  it("ships an escaped, crawlable body fallback with the H1 and FAQ", () => {
    const html = documentFor(guide).metadata.bodyFallbackHtml ?? "";
    expect(html).toContain(`data-public-grow-guide="${guide.slug}"`);
    expect(html).toContain("<h1>");
    expect(html).not.toMatch(/<script/i);
    for (const entry of guide.faq) {
      expect(html).toContain(entry.question.replace(/&/g, "&amp;"));
    }
  });

  it("links sources over https only and opens them in a new tab without an opener", () => {
    const { container } = renderGuide(guide);
    const external = Array.from(container.querySelectorAll("a")).filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("http"),
    );
    for (const source of guide.sources) {
      expect(source.url.startsWith("https://")).toBe(true);
      const anchor = external.find((a) => a.getAttribute("href") === source.url);
      expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
});

describe("cross-links between the four guides", () => {
  it("tissue culture and still air box link to each other", () => {
    const tc = renderGuide(TISSUE_CULTURE_GUIDE);
    expect(hrefs(tc.container)).toContain(STILL_AIR_BOX_GUIDE.path);
    tc.unmount();
    const sab = renderGuide(STILL_AIR_BOX_GUIDE);
    expect(hrefs(sab.container)).toContain(TISSUE_CULTURE_GUIDE.path);
  });

  it("the male guide links to the multiple-tent climate guide", () => {
    const { container } = renderGuide(ISOLATE_MALE_GUIDE);
    expect(hrefs(container)).toContain("/guides/steady-climate-multiple-grow-tents");
  });

  it("every internal link points at a manifest route", () => {
    const manifest = APP_ROUTES.map((r) => r.path);
    const matches = (path: string) =>
      manifest.some((pattern) => {
        const a = pattern.split("/");
        const b = path.split("/");
        return a.length === b.length && a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
      });
    for (const guide of PUBLIC_GROW_GUIDE_ARTICLES) {
      const { container, unmount } = renderGuide(guide);
      const internal = hrefs(container)
        .filter((h) => h.startsWith("/"))
        .map((h) => h.split("?")[0]);
      for (const path of internal) expect(matches(path), `${guide.slug} → ${path}`).toBe(true);
      within(container).getByRole("navigation", { name: "Breadcrumb" });
      unmount();
    }
  });
});

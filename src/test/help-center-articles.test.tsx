import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import { HelpCenterContent, type HelpArticle } from "@/lib/helpCenterContent";
import { DEVICE_CONTROL_SENTENCE, HELP_CENTER_ARTICLES } from "@/constants/helpCenterArticleCopy";
import {
  WATER_ENTRY_UNIT_LABELS,
  waterVolumeFieldLabel,
} from "@/constants/quickLogWaterVolumeUnitCopy";
import {
  LARGE_WATER_AMOUNT_HARD_MAX_ML,
  LARGE_WATER_AMOUNT_THRESHOLD_ML,
} from "@/lib/quickLogWaterVolumeWarningRules";
import { Route as HelpSectionRoute } from "@/routes/help.$section";
import HelpCenterPage from "@/pages/HelpCenterPage";

function article(slug: string): HelpArticle {
  const found = HelpCenterContent.articleBySlug(slug);
  if (!found) throw new Error(`missing help article ${slug}`);
  return found;
}

function renderArticle(entry: HelpArticle) {
  return render(
    <MemoryRouter>
      <HelpCenterPage section={null} article={entry} />
    </MemoryRouter>,
  );
}

/**
 * The five held claims plus any AI Doctor promise. Help topic pages must say
 * nothing about them. Device control is allowed only as DEVICE_CONTROL_SENTENCE.
 */
const HELD_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bcredits?\b/i,
  /credit pack/i,
  /a[- ]la[- ]carte/i,
  /\b(extra|additional|added) (ai )?(charge|fee|cost)s?\b/i,
  /\bcancel/i,
  /\bkpa\b/i,
  /\blate[- ]flower/i,
  /\bai doctor\b/i,
  /\bcontrol/i,
  /\bautomat/i,
];

describe("help topic pages", () => {
  it("serves /help/faq and /help/log-watering from the hub route", async () => {
    expect(HelpCenterContent.articles().map((entry) => entry.path)).toEqual([
      "/help/faq",
      "/help/log-watering",
    ]);
    const loader = HelpSectionRoute.options.loader;
    if (typeof loader !== "function") throw new Error("help section loader must be a function");
    const faq = await loader({ params: { section: "faq" } } as never);
    expect(faq).toMatchObject({ kind: "article", article: { path: "/help/faq" } });
    const hub = await loader({ params: { section: "getting-started" } } as never);
    expect(hub).toMatchObject({ kind: "section", section: { path: "/help/getting-started" } });
    expect(HelpCenterContent.pageBySlug("not-a-page")).toBeNull();
  });

  it("lists each topic page on its hub", () => {
    expect(HelpCenterContent.sectionBySlug("getting-started")?.topics).toEqual([
      { label: "Frequently asked questions", href: "/help/faq" },
    ]);
    expect(HelpCenterContent.sectionBySlug("quick-log-timeline")?.topics).toEqual([
      { label: "How do I log a watering?", href: "/help/log-watering" },
    ]);
    expect(HelpCenterContent.sectionBySlug("developers")?.topics).toEqual([
      { label: "MCP tools reference", href: "/docs/mcp-api" },
    ]);
  });

  it("redirects /faq to the FAQ page and still leaves /docs/mcp-api alone", () => {
    expect(resolveHostRouting({ pathname: "/faq", search: "" })).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/help/faq",
    });
    expect(resolveHostRouting({ pathname: "/docs/mcp-api", search: "" }).kind).toBe("continue");
  });

  it("keeps the held claims and any AI Doctor promise off the topic pages", () => {
    const corpus = HelpCenterContent.articleCopyCorpus().split(DEVICE_CONTROL_SENTENCE).join("");
    const hits = HELD_CLAIM_PATTERNS.filter((pattern) => pattern.test(corpus)).map(String);
    expect(hits).toEqual([]);
    expect(HelpCenterContent.articleCopyCorpus()).toContain(DEVICE_CONTROL_SENTENCE);
    expect(HelpCenterContent.forbiddenCopyHits(HelpCenterContent.publicCopyCorpus())).toEqual([]);
  });

  it("states the water units and limits the Quick Log Water form uses", () => {
    const corpus = HelpCenterContent.articleCopyCorpus();
    for (const label of Object.values(WATER_ENTRY_UNIT_LABELS)) {
      expect(corpus).toContain(`(${label})`);
    }
    expect(waterVolumeFieldLabel("ml")).toBe("Volume (ml)");
    expect(corpus).toContain("type the amount in Volume");
    expect(corpus).toContain(`over ${LARGE_WATER_AMOUNT_THRESHOLD_ML.toLocaleString("en-US")} ml`);
    expect(corpus).toContain(
      `at most ${LARGE_WATER_AMOUNT_HARD_MAX_ML.toLocaleString("en-US")} ml`,
    );
  });

  it("renders the watering steps with a three-level breadcrumb and its own canonical", () => {
    const watering = article("log-watering");
    renderArticle(watering);
    expect(
      screen.getByRole("heading", { level: 1, name: "How do I log a watering?" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(6);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs).toHaveTextContent("Help → Quick Log and Timeline → How do I log a watering?");
    expect(within(crumbs).getByRole("link", { name: "Quick Log and Timeline" })).toHaveAttribute(
      "href",
      "/help/quick-log-timeline",
    );
    expect(document.title).toBe("How do I log a watering? | Help | Verdant Grow Diary");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://verdantgrowdiary.com/help/log-watering",
    );
  });

  it("renders the FAQ answers and support link", () => {
    renderArticle(article("faq"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Frequently asked questions" }),
    ).toBeInTheDocument();
    expect(screen.getByText(DEVICE_CONTROL_SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VPD calculator" })).toHaveAttribute(
      "href",
      "/tools/vpd-calculator",
    );
    expect(screen.getByRole("link", { name: "support@verdantgrowdiary.com" })).toHaveAttribute(
      "href",
      "mailto:support@verdantgrowdiary.com",
    );
  });

  it("emits a static document and route head for each topic page", () => {
    for (const entry of HelpCenterContent.articles()) {
      const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((candidate) => candidate.path === entry.path);
      expect(doc?.metadata.title).toBe(entry.titleTag);
      expect(doc?.metadata.description).toBe(entry.description);
      expect(entry.description.length).toBeLessThanOrEqual(160);
      expect(doc?.metadata.bodyFallbackHtml).toContain(`<h1>${entry.title}</h1>`);
      const head = staticRouteHead(entry.path);
      expect(head.links.find((link) => link.rel === "canonical")?.href).toBe(
        `https://verdantgrowdiary.com${entry.path}`,
      );
    }
    expect(HELP_CENTER_ARTICLES).toHaveLength(2);
  });
});

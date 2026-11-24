import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { STEADY_CLIMATE_GUIDE } from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

const HEADING = "Compare VPD for each tent";
const QUESTION = "How can I compare VPD between two grow tents?";

const section = STEADY_CLIMATE_GUIDE.sections.find((s) => s.heading === HEADING);
const faq = STEADY_CLIMATE_GUIDE.faq.find((f) => f.question === QUESTION);

describe("steady-climate guide: Compare VPD for each tent (#3079)", () => {
  it("adds exactly one section and one FAQ, with the section last", () => {
    expect(STEADY_CLIMATE_GUIDE.sections.map((s) => s.heading)).toEqual([
      "Why tents in one room drift apart",
      "Measure each tent on its own",
      "Manage the shared room air",
      "Fix the tent that drifts, one change at a time",
      HEADING,
    ]);
    expect(STEADY_CLIMATE_GUIDE.faq).toHaveLength(5);
    expect(STEADY_CLIMATE_GUIDE.faq.at(-1)?.question).toBe(QUESTION);
  });

  it("links the VPD calculator and the stage chart", () => {
    expect(section?.links).toEqual([
      { label: "VPD calculator", to: "/tools/vpd-calculator" },
      { label: "VPD chart by growth stage", to: "/vpd-chart" },
    ]);
  });

  it("labels results air VPD and keeps the approved boundaries", () => {
    const copy = [...(section?.paragraphs ?? []), faq?.answer ?? ""].join("\n");
    expect(copy).toContain("Label each result air VPD unless you measured leaf temperature.");
    expect(copy).toContain("Check that your sensors agree first");
    expect(copy).not.toMatch(/side[- ]by[- ]side|\bsync|\balerts?\b|\breminders?\b|°C|celsius/i);
  });

  it("renders the section after the other sections and before Keep the record in Verdant", () => {
    render(
      <MemoryRouter>
        <PublicGrowGuideArticle guide={STEADY_CLIMATE_GUIDE} />
      </MemoryRouter>,
    );
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const at = h2s.indexOf(HEADING);
    expect(at).toBeGreaterThan(h2s.indexOf("Fix the tent that drifts, one change at a time"));
    expect(h2s[at + 1]).toBe("Keep the record in Verdant");
    expect(screen.getByRole("link", { name: "VPD calculator" })).toHaveAttribute(
      "href",
      "/tools/vpd-calculator",
    );
  });

  it("ships the section and FAQ in the crawlable fallback and FAQPage JSON-LD", () => {
    const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((d) => d.path === STEADY_CLIMATE_GUIDE.path);
    expect(doc?.metadata.bodyFallbackHtml).toContain(`<h2>${HEADING}</h2>`);
    const faqNode = (doc?.metadata.jsonLd as ReadonlyArray<Record<string, unknown>>).find(
      (node) => node["@type"] === "FAQPage",
    ) as { mainEntity: Array<{ name: string }> };
    expect(faqNode.mainEntity.map((q) => q.name)).toContain(QUESTION);
  });
});

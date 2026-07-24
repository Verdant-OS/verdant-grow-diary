/**
 * Cultivar detail page — SEO structured data + acquisition CTA.
 *
 * Doctrine: sample/reference cultivars must NOT emit Product/Offer schema or
 * fixed-chemistry claims. The FAQ JSON-LD must mirror the visibly rendered FAQ.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CultivarPage from "@/pages/CultivarPage";
import { buildCultivarFaqItems } from "@/lib/cultivarDetailSeo";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

function renderPage(slug: string) {
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

function ldDocs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  document.head
    .querySelectorAll<HTMLScriptElement>("script[data-page-ldjson]")
    .forEach((s) => {
      out[s.getAttribute("data-page-ldjson") ?? ""] = JSON.parse(s.text);
    });
  return out;
}

afterEach(cleanup);

describe("Cultivar detail SEO", () => {
  it("renders a visible FAQ matching the FAQ helper", () => {
    renderPage("og-kush");
    const expected = buildCultivarFaqItems(
      VERDANT_CULTIVARS.find((c) => c.slug === "og-kush")!,
    );
    const rendered = screen.getAllByTestId("cultivar-faq-item");
    expect(rendered.length).toBe(expected.length);
    expect(screen.getByTestId("cultivar-faq")).toHaveTextContent(expected[0].question);
  });

  it("emits Article, FAQPage, and BreadcrumbList JSON-LD", () => {
    renderPage("og-kush");
    const docs = ldDocs();
    const types = Object.values(docs).map((d) => (d as { "@type"?: string })["@type"]);
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
    expect(types).toContain("BreadcrumbList");
  });

  it("FAQPage JSON-LD mirrors the visibly rendered FAQ (single source of truth)", () => {
    renderPage("gg4");
    const faqDoc = ldDocs()[`cultivar-gg4-faq`] as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    const visible = screen
      .getAllByTestId("cultivar-faq-item")
      .map((el) => el.querySelector("dt")?.textContent);
    expect(faqDoc.mainEntity.map((q) => q.name)).toEqual(visible);
  });

  it("never emits Product or Offer schema (sample reference, not a product)", () => {
    renderPage("gg4");
    const raw = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>("script[data-page-ldjson]"),
    )
      .map((s) => s.text)
      .join("\n");
    expect(raw).not.toMatch(/"@type"\s*:\s*"(Product|Offer|AggregateOffer)"/);
  });

  it("shows a signup acquisition CTA to /auth", () => {
    renderPage("og-kush");
    const cta = screen.getByTestId("cultivar-signup-cta");
    expect(cta).toHaveAttribute("href", "/auth");
  });
});

/**
 * Public /guides/import-grow-sensor-csv: route render, self-canonical,
 * HowTo + FAQPage + BreadcrumbList + WebPage, sitemap slug, and the
 * two-way links with the AC Infinity and Spider Farmer export guides.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import GuidePage from "@/pages/GuidePage";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { validateJsonLdObject } from "../../scripts/validate-jsonld-rich-results.mjs";

const SLUG = "import-grow-sensor-csv";
const PATH = `/guides/${SLUG}`;
const CANONICAL = `https://verdantgrowdiary.com${PATH}`;
const CTA =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=import-grow-sensor-csv";

function renderGuide() {
  return render(
    <MemoryRouter initialEntries={[PATH]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonLdByType(type: string) {
  const script = staticRouteHead(PATH).scripts.find(
    (entry) => JSON.parse(entry.children)["@type"] === type,
  );
  return script ? JSON.parse(script.children) : null;
}

describe("/guides/import-grow-sensor-csv", () => {
  it("renders the question, three steps, six FAQs and column table", () => {
    const guide = findGuideBySlug(SLUG)!;
    renderGuide();
    expect(screen.getByRole("heading", { level: 1, name: guide.h1 })).toBeInTheDocument();
    expect(screen.getByTestId("guide-page")).toHaveAttribute("data-guide-slug", SLUG);
    for (const step of guide.howTo!.steps) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    for (const entry of guide.faq) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
    expect(guide.faq).toHaveLength(6);
    expect(
      screen.getByRole("table", { name: "CSV columns the importer reads" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import your first CSV free →" })).toHaveAttribute(
      "href",
      CTA,
    );
  });

  it("sets a self-canonical and production og:url", () => {
    const head = staticRouteHead(PATH);
    const canonical = head.links.find((link) => link.rel === "canonical");
    const ogUrl = head.meta.find((entry) => "property" in entry && entry.property === "og:url");
    expect(canonical?.href).toBe(CANONICAL);
    expect(ogUrl && "content" in ogUrl ? ogUrl.content : null).toBe(CANONICAL);
    expect(head.meta.find((entry) => "title" in entry && entry.title)?.title).toBe(
      findGuideBySlug(SLUG)!.title,
    );
  });

  it("emits valid HowTo, FAQPage, BreadcrumbList and WebPage that match the visible text", () => {
    const guide = findGuideBySlug(SLUG)!;
    const howTo = jsonLdByType("HowTo");
    const faq = jsonLdByType("FAQPage");
    const crumbs = jsonLdByType("BreadcrumbList");
    const page = jsonLdByType("WebPage");

    expect(howTo.step.map((step: { text: string }) => step.text)).toEqual([...guide.howTo!.steps]);
    expect(
      faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => q.name),
    ).toEqual(guide.faq.map((entry) => entry.question));
    expect(
      faq.mainEntity.map((q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text),
    ).toEqual(guide.faq.map((entry) => entry.answer));
    expect(crumbs.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      "Home",
      "Grower Guides",
      guide.h1,
    ]);
    expect(page["@id"]).toBe(`${CANONICAL}#webpage`);
    expect(page.url).toBe(CANONICAL);
    expect(page.dateModified).toBe("2026-11-03");

    for (const node of [howTo, faq, crumbs, page]) {
      const result = validateJsonLdObject(node, { file: PATH, index: 0, path: "$" });
      expect(result.issues).toEqual([]);
    }
  });

  it("is listed in the sitemap and links both ways with the export guides", () => {
    const sitemap = readFileSync(resolve(__dirname, "../../public/sitemap.xml"), "utf8");
    expect(sitemap).toContain(`<loc>${CANONICAL}</loc>`);

    renderGuide();
    expect(
      screen.getByRole("link", { name: "AC Infinity data logging into a grow diary" }),
    ).toHaveAttribute("href", "/guides/ac-infinity-data-logging");
    expect(screen.getByRole("link", { name: "Spider Farmer data logging" })).toHaveAttribute(
      "href",
      "/guides/spider-farmer-data-logging",
    );

    const ac = STATIC_PUBLIC_SEO_DOCUMENTS.find(
      (doc) => doc.path === "/guides/ac-infinity-data-logging",
    );
    const sf = STATIC_PUBLIC_SEO_DOCUMENTS.find(
      (doc) => doc.path === "/guides/spider-farmer-data-logging",
    );
    expect(ac?.metadata.bodyFallbackHtml).toContain('href="/guides/import-grow-sensor-csv"');
    expect(sf?.metadata.bodyFallbackHtml).toContain('href="/guides/import-grow-sensor-csv"');
  });
});

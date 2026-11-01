/**
 * VER-321 (#2661) rendering paths for the AC Infinity / Spider Farmer CSV
 * import explainer: intro heading + CTA, steps, inline links, follow-on blocks,
 * FAQ footer, in both the React page and the static no-JS fallback. Every CTA
 * must carry its exact UTM URL and no anchor may have an empty href.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import GuidePage from "@/pages/GuidePage";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const AC_CTA =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=ac-infinity-data-logging";
const SF_CTA =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=spider-farmer-data-logging";
const CTA_LABEL = "Import your first CSV free";

function renderGuide(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function staticFallback(slug: string): string {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((d) => d.path === `/guides/${slug}`);
  if (!doc) throw new Error(`missing static document for ${slug}`);
  return doc.metadata.bodyFallbackHtml ?? "";
}

const amp = (url: string) => url.replace(/&/g, "&amp;");

function expectNoEmptyHrefs(container: HTMLElement) {
  for (const a of Array.from(container.querySelectorAll("a"))) {
    const href = a.getAttribute("href");
    expect(href, a.textContent ?? "").toBeTruthy();
    expect(href).not.toMatch(/^#?$|^javascript:/i);
  }
}

describe("AC Infinity CSV import guide (React)", () => {
  it("renders the intro heading, steps, follow-on blocks and FAQ footer", () => {
    const guide = findGuideBySlug("ac-infinity-data-logging")!;
    renderGuide("ac-infinity-data-logging");
    expect(screen.getByRole("heading", { name: guide.introHeading! })).toBeInTheDocument();
    expect(screen.getByText("Pick your file and import it.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "See it in your tent history" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free and Pro" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "plans" })).toHaveAttribute("href", "/pricing");
    expect(screen.getAllByText(/Related:/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Plans" })).toHaveAttribute("href", "/pricing");
  });

  it("every CSV CTA carries the exact AC Infinity UTM URL and no href is empty", () => {
    const { container } = renderGuide("ac-infinity-data-logging");
    const ctas = screen.getAllByRole("link", { name: CTA_LABEL });
    expect(ctas.length).toBe(3);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", AC_CTA);
    expectNoEmptyHrefs(container);
  });
});

describe("Spider Farmer CSV import section (React)", () => {
  it("renders the level-3 how-to, closing link and exact Spider Farmer UTM CTA", () => {
    const { container } = renderGuide("spider-farmer-data-logging");
    expect(
      screen.getByRole("heading", { level: 3, name: "How to import your Spider Farmer CSV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "AC Infinity and Spider Farmer CSV import" }),
    ).toHaveAttribute("href", "/guides/ac-infinity-data-logging");
    const ctas = screen.getAllByRole("link", { name: CTA_LABEL });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", SF_CTA);
    expectNoEmptyHrefs(container);
  });
});

describe("CSV import guides (static no-JS fallback)", () => {
  it("emits the exact UTM CTAs and never an empty href", () => {
    const ac = staticFallback("ac-infinity-data-logging");
    const sf = staticFallback("spider-farmer-data-logging");
    expect(ac).toContain(`href="${amp(AC_CTA)}"`);
    expect(ac).toContain("<li>Pick your file and import it.</li>");
    expect(ac).toContain('<a href="/pricing">plans</a>');
    expect(sf).toContain(`href="${amp(SF_CTA)}"`);
    expect(sf).toContain('<a href="/guides/ac-infinity-data-logging">');
    for (const html of [ac, sf]) {
      expect(html).not.toMatch(/href=""/);
      expect(html).not.toMatch(/href="#"/);
    }
  });
});

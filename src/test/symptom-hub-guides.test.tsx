import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import SymptomReferenceTable from "@/components/SymptomReferenceTable";
import {
  CANNABIS_SYMPTOM_REFERENCE_TABLE,
  SYMPTOM_NO_STACK_RULE,
} from "@/constants/cannabisSymptomReference";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GuidePage from "@/pages/GuidePage";

const SLUGS = [
  "cannabis-leaf-symptoms",
  "cannabis-leaves-turning-yellow",
  "cannabis-leaf-spots-lesions",
  "cannabis-burnt-crispy-leaf-tips",
] as const;

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('script[type="application/ld+json"][data-page-ldjson]')
    .forEach((script) => script.remove());
});

describe("public symptom hub and guides", () => {
  it.each(SLUGS)("publishes %s with editorial provenance and cautious language", (slug) => {
    const guide = findGuideBySlug(slug)!;
    expect(guide).not.toBeNull();
    expect(guide.publishedOn).toBe("2026-08-01");
    expect(guide.modifiedOn).toBe("2026-08-01");
    expect(guide.referenceTable?.rows.length).toBeGreaterThan(0);
    const copy = JSON.stringify(guide);
    expect(copy).toMatch(/not a diagnosis|does not|do not|without/i);
    expect(copy).not.toMatch(
      /auto[- ]?(?:diagnos|treat|adjust|control)|guaranteed cure|definitely deficient/i,
    );
  });

  it("keeps every symptom-guide CTA destination truthful to its label and contract", () => {
    const hub = findGuideBySlug("cannabis-leaf-symptoms")!;
    expect(hub.cta).toBeUndefined();

    for (const slug of SLUGS.slice(1)) {
      const cta = findGuideBySlug(slug)?.cta;
      expect(cta).toMatchObject({
        label: "Open the symptom evidence hub",
        to: "/guides/cannabis-leaf-symptoms",
      });

      const ctaCopy = `${cta?.label} ${cta?.heading} ${cta?.description}`;
      expect(ctaCopy).toMatch(/compare|evidence|verify/i);
      expect(ctaCopy).not.toMatch(/quick log|\brecord\b|\bsave\b|diary entry/i);
    }
  });

  it("uses one shared accessible table and one exact no-stack rule", () => {
    render(<SymptomReferenceTable table={CANNABIS_SYMPTOM_REFERENCE_TABLE} />);
    expect(
      screen.getByRole("table", { name: CANNABIS_SYMPTOM_REFERENCE_TABLE.caption }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Visible pattern",
      "Evidence to compare",
      "What to log next",
      "What not to assume",
    ]);
    expect(screen.getByText("Yellowing / discoloration")).toBeInTheDocument();
    expect(screen.getByText("Burnt, crispy, or damaged tips")).toBeInTheDocument();
    for (const row of CANNABIS_SYMPTOM_REFERENCE_TABLE.rows) {
      expect(row.whatToLogNext.trim().length).toBeGreaterThan(0);
      expect(screen.getByText(row.whatToLogNext)).toBeInTheDocument();
    }
    expect(SYMPTOM_NO_STACK_RULE).toBe(
      "Avoid changing feeding, watering, lighting, and airflow at the same time. Preserve a baseline, change one justified variable, and record the response.",
    );
  });

  it("makes the wide reference table keyboard-focusable and explains horizontal scrolling", () => {
    render(<SymptomReferenceTable table={CANNABIS_SYMPTOM_REFERENCE_TABLE} />);
    const region = screen.getByRole("region", { name: /symptom evidence table/i });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAttribute("aria-describedby");
    expect(
      screen.getByText(
        "Swipe horizontally, or focus this table and use the arrow keys, to compare all four evidence columns.",
      ),
    ).toBeVisible();
  });

  it("cross-links the symptom hub and all three focused guides", () => {
    const hub = findGuideBySlug("cannabis-leaf-symptoms")!;
    const focusedSlugs = SLUGS.slice(1);
    expect(hub.related).toEqual(expect.arrayContaining(focusedSlugs));
    for (const slug of focusedSlugs) {
      const expectedLinks = [
        "cannabis-leaf-symptoms",
        ...focusedSlugs.filter((item) => item !== slug),
      ];
      expect(findGuideBySlug(slug)?.related).toEqual(expect.arrayContaining(expectedLinks));
    }
  });

  it("emits one route-head FAQPage whose questions and answers mirror the visible hub FAQ", () => {
    const hub = findGuideBySlug("cannabis-leaf-symptoms")!;
    render(
      <MemoryRouter initialEntries={["/guides/cannabis-leaf-symptoms"]}>
        <Routes>
          <Route path="/guides/:slug" element={<GuidePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const faq = staticRouteHead("/guides/cannabis-leaf-symptoms")
      .scripts.map((script) => JSON.parse(script.children))
      .find((node) => node["@type"] === "FAQPage") as {
      "@type": string;
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };

    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity.map((entry) => entry.name)).toEqual(
      hub.faq.map((entry) => entry.question),
    );
    expect(faq.mainEntity.map((entry) => entry.acceptedAnswer.text)).toEqual(
      hub.faq.map((entry) => entry.answer),
    );
    for (const item of hub.faq) {
      expect(screen.getByRole("button", { name: item.question })).toBeVisible();
    }
  });
});

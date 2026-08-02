import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import GuidePage from "@/pages/GuidePage";

afterEach(() => {
  cleanup();
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

function renderGuide(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("public VPD and sensor-truth evidence contract", () => {
  it("states the complete minimum before derived VPD can be treated as authoritative", () => {
    const vpd = findGuideBySlug("grow-room-vpd-tracker");
    const sensorTruth = findGuideBySlug("sensor-truth-grow-room");

    expect(vpd).not.toBeNull();
    expect(sensorTruth).not.toBeNull();

    for (const guide of [vpd, sensorTruth]) {
      const copy = JSON.stringify(guide).toLowerCase();
      expect(copy).toContain("calculated, not directly measured");
      expect(copy).toContain("operating conditions");
      expect(copy).toMatch(/75% (?:rh|relative humidity)/);
      expect(copy).toContain("leaf-temperature offset");
      expect(copy).toContain("canopy");
      expect(copy).toContain("calibration date");
      expect(copy).toMatch(
        /unverified[^.]{0,120}lower confidence|lower confidence[^.]{0,120}unverified/,
      );
      expect(copy).toContain("air vpd");
    }
  });

  it("renders a scannable, accessible VPD evidence gate with fail-closed outcomes", () => {
    renderGuide("grow-room-vpd-tracker");

    const table = screen.getByRole("table", { name: /vpd evidence gate/i });
    const rows = within(table).getAllByRole("row");

    expect(rows).toHaveLength(7);
    expect(within(table).getByText("Temperature")).toBeVisible();
    expect(within(table).getByText("Relative humidity")).toBeVisible();
    expect(within(table).getByText("Leaf-temperature basis")).toBeVisible();
    expect(within(table).getByText("Probe placement")).toBeVisible();
    expect(within(table).getByText("Identity and time")).toBeVisible();
    expect(within(table).getByText("Derived result")).toBeVisible();
    expect(within(table).getAllByText(/conditional/i).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/untrusted/i).length).toBeGreaterThan(0);
  });

  it("keeps the visible FAQ and JSON-LD honest about air VPD without leaf temperature", async () => {
    renderGuide("grow-room-vpd-tracker");

    expect(
      screen.getByRole("button", { name: /can i use vpd without measuring leaf temperature/i }),
    ).toBeVisible();

    const faqScript = await screen
      .findByTestId("guide-page")
      .then(() =>
        document.head.querySelector<HTMLScriptElement>(
          'script[data-page-ldjson="guide-grow-room-vpd-tracker-faq"]',
        ),
      );
    expect(faqScript).not.toBeNull();
    expect(faqScript?.textContent?.toLowerCase()).toContain("air vpd");
    expect(faqScript?.textContent?.toLowerCase()).toContain("not leaf vpd");
  });

  it("shows authoritative scope sources and does not claim a universal VPD target", () => {
    const guide = findGuideBySlug("grow-room-vpd-tracker");
    expect(guide).not.toBeNull();

    const sourceUrls = guide?.sources?.map((source) => source.href) ?? [];
    expect(sourceUrls).toContain("https://nvlpubs.nist.gov/nistpubs/jres/081/1/V81.N01.A06.pdf");
    expect(sourceUrls).toContain("https://www.fao.org/4/X0490E/x0490e07.htm");
    expect(sourceUrls).toContain("https://pmc.ncbi.nlm.nih.gov/articles/PMC12571154/");

    const copy = JSON.stringify(guide).toLowerCase();
    expect(copy).not.toMatch(/universal (?:ideal |perfect )?vpd target/);
  });
});

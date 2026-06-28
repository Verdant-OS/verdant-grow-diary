/**
 * Pricing / Proof Polish v1 — copy + safety regressions.
 *
 * Asserts the polish copy renders and that forbidden / unsafe phrases
 * do NOT appear anywhere on the Pricing page or BillingPlaceholder.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Pricing from "@/pages/Pricing";
import BillingPlaceholder from "@/pages/BillingPlaceholder";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

const FORBIDDEN = [
  "ai grows for you",
  "autopilot",
  "guaranteed yield",
  "diagnosed with certainty",
  "fully automated",
  "controls your grow",
  "automatically executes",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "fake live",
];

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

function renderBilling(plan: string) {
  return render(
    <MemoryRouter initialEntries={[`/billing/${plan}`]}>
      <Routes>
        <Route path="/billing/:plan" element={<BillingPlaceholder />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Pricing — proof polish copy", () => {
  it("hero shows the protect-grow-history line", () => {
    renderPricing();
    expect(
      screen.getByRole("heading", { level: 1 }).textContent ?? "",
    ).toContain("Protect your grow history");
  });

  it("renders the Plant memory. Sensor truth. tagline", () => {
    renderPricing();
    expect(
      screen.getByText(/Plant memory\.\s*Sensor truth\.\s*Better decisions\./i),
    ).toBeInTheDocument();
  });

  it("renders the proof callouts block with the 4 callouts", () => {
    renderPricing();
    const block = screen.getByTestId("pricing-proof-callouts");
    expect(block.textContent).toContain("Post-Grow Learning Report");
    expect(block.textContent).toContain("Print / Save PDF export");
    expect(block.textContent).toContain("Sensor truth");
    expect(block.textContent).toContain("Approval-required actions");
    expect(screen.getAllByTestId("pricing-proof-callout")).toHaveLength(4);
  });

  it("Pro card lists Post-Grow Learning Report (Print / Save PDF)", () => {
    renderPricing();
    const pro = screen.getByTestId("pricing-card-pro");
    expect(pro.textContent).toContain("Post-Grow Learning Report (Print / Save PDF)");
    expect(pro.textContent).toContain("Multi-tent grow memory");
  });

  it("comparison table includes Post-Grow Learning Report and CSV import rows", () => {
    renderPricing();
    const table = screen.getByTestId("pricing-comparison-table");
    expect(table.textContent).toContain("Post-Grow Learning Report (Print / Save PDF)");
    expect(table.textContent).toContain("CSV sensor import (source-labeled)");
  });

  it("Free tier does not imply the basic diary is locked away", () => {
    renderPricing();
    const free = screen.getByTestId("pricing-card-free");
    expect(free.textContent).toContain("Plant diary and timeline");
    expect(free.textContent).toContain("CSV sensor import");
  });

  it("Founder Lifetime shows $129 and first 75 limit", () => {
    renderPricing();
    const founder = screen.getByTestId("pricing-card-founder");
    expect(founder.textContent).toContain("$129");
    expect(founder.textContent).toContain("75");
  });

  it("CSV proof copy never calls CSV live", () => {
    renderPricing();
    const block = screen.getByTestId("pricing-proof-callouts");
    const text = (block.textContent ?? "").toLowerCase();
    // CSV section must never label CSV as live.
    const csvIdx = text.indexOf("csv");
    expect(csvIdx).toBeGreaterThanOrEqual(0);
    // No phrase "csv ... live" within a short window
    const tail = text.slice(csvIdx, csvIdx + 200);
    expect(tail).not.toMatch(/csv[^.]{0,80}\blive\b/);
  });

  it("forbidden marketing/automation phrases never appear on Pricing", () => {
    renderPricing();
    const body = document.body.textContent?.toLowerCase() ?? "";
    for (const term of FORBIDDEN) {
      expect(body, `forbidden phrase leaked: ${term}`).not.toContain(term);
    }
  });

  it("Pricing FAQ v1.1 — renders the protected-grow-history trust answer", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-faq-what-paying-for")).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).toContain("What am I really paying for?");
    expect(body).toContain("grow memory system");
    expect(body).toContain("protected grow history");
    expect(body).toContain("source-labeled sensor data");
  });

  it("Pricing FAQ v1.1 — renders approval-required / no-device-command answer", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-faq-device-control")).toBeInTheDocument();
    const body = (document.body.textContent ?? "").toLowerCase();
    expect(body).toContain("does verdant control my grow equipment");
    expect(body).toContain("does not send device commands");
    expect(body).toContain("grower decides");
  });

  it("Pricing FAQ v1.1 — CSV imports FAQ does not call CSV live", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-faq-csv-imports")).toBeInTheDocument();
    const body = (document.body.textContent ?? "").toLowerCase();
    expect(body).toContain("how does verdant handle csv sensor imports");
    expect(body).toContain("csv imports stay labeled as csv");
    // CSV must never be called live in the FAQ answer
    const faqIdx = body.indexOf("csv imports stay labeled as csv");
    const window = body.slice(faqIdx, faqIdx + 300);
    expect(window).not.toMatch(/csv[^.]{0,80}\blive\b/);
  });

  it("Pricing FAQ v1.1 — Post-Grow Learning Report answer renders", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-faq-post-grow-report")).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).toContain("What does the Post-Grow Learning Report do?");
    expect(body).toContain("reviewable report");
    expect(body.toLowerCase()).toContain("alerts");
  });

  it("Pricing FAQ v1.1 — checkout sandbox honesty FAQ renders", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-faq-checkout-sandbox")).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).toContain("Is checkout live?");
    expect(body.toLowerCase()).toContain("sandbox preview");
    expect(body.toLowerCase()).toContain("no live charge");
  });
});

describe("BillingPlaceholder — sandbox disclosure polish", () => {
  it("renders above-the-fold sandbox banner with honest copy", () => {
    renderBilling("pro-monthly");
    const banner = screen.getByTestId("billing-sandbox-banner");
    expect(banner.textContent).toContain("sandbox preview");
    expect(banner.textContent).toContain("No live charge");
  });

  it("renders for founder-lifetime plan too", () => {
    renderBilling("founder-lifetime");
    expect(screen.getByTestId("billing-sandbox-banner")).toBeInTheDocument();
  });

  it("forbidden marketing/automation phrases never appear on BillingPlaceholder", () => {
    renderBilling("pro-annual");
    const body = document.body.textContent?.toLowerCase() ?? "";
    for (const term of FORBIDDEN) {
      expect(body, `forbidden phrase leaked: ${term}`).not.toContain(term);
    }
  });
});

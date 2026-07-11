/**
 * Pricing / Proof Polish v1 — copy + safety regressions.
 *
 * Asserts the polish copy renders and that forbidden / unsafe phrases
 * do NOT appear anywhere on the Pricing page. (The retired
 * `BillingPlaceholder` describe block was removed in Slice F.)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pricing from "@/pages/Pricing";

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

  function openFaqAndGetText(testId: string): string {
    const item = screen.getByTestId(testId);
    const trigger = within(item).getByRole("button");
    fireEvent.click(trigger);
    return item.textContent ?? "";
  }

  it("Pricing FAQ v1.1 — renders the protected-grow-history trust answer", () => {
    renderPricing();
    const text = openFaqAndGetText("pricing-faq-what-paying-for");
    expect(text).toContain("What am I really paying for?");
    expect(text).toContain("grow memory system");
    expect(text).toContain("protected grow history");
    expect(text).toContain("source-labeled sensor data");
  });

  it("Pricing FAQ v1.1 — renders approval-required / no-device-command answer", () => {
    renderPricing();
    const text = openFaqAndGetText("pricing-faq-device-control").toLowerCase();
    expect(text).toContain("does verdant control my grow equipment");
    expect(text).toContain("does not send device commands");
    expect(text).toContain("grower decides");
  });

  it("Pricing FAQ v1.1 — CSV imports FAQ does not call CSV live", () => {
    renderPricing();
    const text = openFaqAndGetText("pricing-faq-csv-imports").toLowerCase();
    expect(text).toContain("csv imports stay labeled as csv");
    expect(text).not.toMatch(/csv[^.]{0,80}\blive\b/);
  });

  it("Pricing FAQ v1.1 — Post-Grow Learning Report answer renders", () => {
    renderPricing();
    const text = openFaqAndGetText("pricing-faq-post-grow-report");
    expect(text).toContain("What does the Post-Grow Learning Report do?");
    expect(text).toContain("reviewable report");
    expect(text.toLowerCase()).toContain("alerts");
  });

  it("Pricing FAQ v1.1 — checkout sandbox honesty FAQ renders", () => {
    renderPricing();
    const text = openFaqAndGetText("pricing-faq-checkout-sandbox");
    expect(text).toContain("Is checkout live?");
    expect(text.toLowerCase()).toContain("sandbox preview");
    expect(text.toLowerCase()).toContain("no live charge");
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

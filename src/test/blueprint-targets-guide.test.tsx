/**
 * BlueprintTargetsGuide — public target-band reference.
 *
 * The page exists to be crawled, so the load-bearing property is that every
 * stage's bands render on FIRST PAINT with no interaction. The teaser on
 * /tools/vpd-calculator is deliberately gated behind a stage selection; this
 * page must not inherit that behaviour or it defeats its own purpose.
 *
 * Bands are asserted against SOP_BLUEPRINT_TARGETS rather than hardcoded, so
 * a change to the source of truth cannot silently desync the public page.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import BlueprintTargetsGuide, { buildStageMetricRows } from "@/pages/BlueprintTargetsGuide";
import { SOP_BLUEPRINT_TARGETS } from "@/constants/blueprintTargets";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/BrandLogo", () => ({
  default: () => <div data-testid="brand-logo" />,
}));

const ALL_STAGES = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
] as const;

describe("BlueprintTargetsGuide", () => {
  it("renders every stage on first paint with no interaction", () => {
    render(<BlueprintTargetsGuide />);
    for (const stage of ALL_STAGES) {
      expect(
        screen.getByTestId(`blueprint-targets-stage-${stage}`),
        `stage ${stage} must be crawlable without interaction`,
      ).toBeInTheDocument();
    }
  });

  it("renders a row for every band the source of truth defines", () => {
    render(<BlueprintTargetsGuide />);
    for (const stage of ALL_STAGES) {
      const expectedRows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS[stage]);
      expect(expectedRows.length).toBeGreaterThan(0);
      const section = screen.getByTestId(`blueprint-targets-stage-${stage}`);
      for (const row of expectedRows) {
        expect(
          within(section).getByTestId(`blueprint-targets-row-${stage}-${row.key}`),
        ).toBeInTheDocument();
      }
    }
  });

  it("omits metrics with no target rather than showing them blank", () => {
    // Dry & cure carries only temp + RH: a cut plant takes up no nutrients
    // and does not photosynthesise, so EC/pH/PPFD/DLI must be absent.
    const rows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.harvest);
    const keys = rows.map((r) => r.key);
    expect(keys).not.toContain("ec");
    expect(keys).not.toContain("ph");
    expect(keys).not.toContain("ppfd");
    expect(keys).not.toContain("dli");
    expect(keys).toContain("rh");
  });

  it("splits day and night temperature only when the bands actually differ", () => {
    // veg has a real split (24-27 day / 19-22 night); seedling does not.
    const vegKeys = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.veg).map((r) => r.key);
    expect(vegKeys).toContain("tempC-day");
    expect(vegKeys).toContain("tempC-night");
    expect(vegKeys).not.toContain("tempC");

    const seedlingKeys = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.seedling).map((r) => r.key);
    expect(seedlingKeys).toContain("tempC");
    expect(seedlingKeys).not.toContain("tempC-day");
  });

  it("shows Fahrenheit alongside Celsius without a stored unit preference", () => {
    // The unit helper reads localStorage and would throw under SSR, so the
    // page must convert inline. Flower day band is 20-26 C = 68-78.8 F.
    const rows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.flower);
    const dayTemp = rows.find((r) => r.key === "tempC-day");
    expect(dayTemp?.value).toContain("20–26 °C");
    expect(dayTemp?.value).toContain("68–78.8 °F");
  });

  it("offers a plan-neutral signup CTA and makes no tier claim", () => {
    render(<BlueprintTargetsGuide />);
    const cta = screen.getByTestId("blueprint-targets-cta");
    // Craft is not purchasable-verified yet, so this page must not sell it.
    expect(cta.textContent ?? "").not.toMatch(/craft/i);
    expect(cta.textContent ?? "").not.toMatch(/\bpro\b/i);
  });

  it("sends the CTA to signup mode, not the sign-in tab", () => {
    render(<BlueprintTargetsGuide />);
    const href =
      screen.getByTestId("blueprint-targets-signup").getAttribute("href") ?? "";
    // Bare /auth resolves to mode "signin" and skips the signup page-view path.
    expect(href).toContain("mode=signup");
    expect(href).not.toBe("/auth");
    // No utm_* source: an attribution source only records once it is in the
    // server-side allowlists, so claiming one here would measure nothing.
    expect(href).not.toContain("utm_source");
  });

  it("names the medium on feed EC and pH so soil growers are not misled", () => {
    // SOP feed figures are soilless/hydro; soil buffers pH and runs ~6.0-6.8.
    const rows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.veg);
    const ph = rows.find((r) => r.key === "ph");
    const ec = rows.find((r) => r.key === "ec");
    expect(ph?.note ?? "").toMatch(/soilless or hydro/i);
    expect(ph?.note ?? "").toMatch(/6\.0.*6\.8/);
    expect(ec?.note ?? "").toMatch(/soilless or hydro/i);
    // Environment metrics are not medium-specific and must stay unqualified.
    expect(rows.find((r) => r.key === "rh")?.note).toBeUndefined();
  });
});

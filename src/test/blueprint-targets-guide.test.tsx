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
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { VERDANT_BLUEPRINT_TARGETS_FAQ } from "@/constants/verdantSeoContent";

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

  it("scopes feed bands to input only, never runoff", () => {
    // blueprintFeedingInput reads inputEcMsCm/inputPh precisely because runoff
    // is excluded; runoff reads higher as salts accumulate, so offering these
    // as a runoff target would invite a feed change on an incomparable number.
    const rows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS.flower);
    const ec = rows.find((r) => r.key === "ec");
    const ph = rows.find((r) => r.key === "ph");
    expect(ec?.label).toMatch(/input/i);
    expect(ph?.label).toMatch(/input/i);
    expect(ec?.note ?? "").toMatch(/not runoff/i);
    expect(ph?.note ?? "").toMatch(/not runoff/i);
  });

  it("does not claim a superlative for a stage the bands contradict", () => {
    // Every copy defect found in review so far was prose disagreeing with the
    // table rendered directly beneath it. Peak feed and peak light are FLOWER
    // (ec 1.8-2.6, ppfd 700-1000), not pre-flower (1.6-2.0, 600-800), so guard
    // the superlative mechanically rather than by proofreading.
    const ecMax = (s: keyof typeof SOP_BLUEPRINT_TARGETS) =>
      SOP_BLUEPRINT_TARGETS[s].ec?.max ?? 0;
    expect(ecMax("flower")).toBeGreaterThan(ecMax("preflower"));

    render(<BlueprintTargetsGuide />);
    const preflower =
      screen.getByTestId("blueprint-targets-stage-preflower").textContent ?? "";
    expect(preflower).not.toMatch(/feed peaks|peak feed/i);
  });

  it("does not present the day/night split as VPD control on its own", () => {
    // At fixed humidity a cooler night LOWERS VPD; it does not hold it steady.
    render(<BlueprintTargetsGuide />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/keeps vapou?r pressure deficit stable/i);
    expect(body).toMatch(/temperature and humidity together/i);
  });

  it("presents any late-flower taper as evidence-dependent, not automatic", () => {
    render(<BlueprintTargetsGuide />);
    const section = screen.getByTestId("blueprint-targets-stage-late_flower");
    const text = section.textContent ?? "";
    // The care guide is explicit that a flush is not automatic.
    expect(text).toMatch(/runoff EC|leaf-tip burn|salt stress/i);
    expect(text).not.toMatch(/for the flush ahead of harvest/i);
  });
});

describe("BlueprintTargetsGuide structured data", () => {
  it("emits FAQPage and BreadcrumbList in the SERVER-rendered head", () => {
    // Previously these were injected from a useEffect, so they existed only
    // after hydration — a crawler reading the SSR response saw the tables but
    // no schema at all. They are registered on the static public document now.
    const head = staticRouteHead("/tools/blueprint-targets");
    const types = head.scripts.map((s) => JSON.parse(s.children)["@type"]);
    expect(types).toContain("WebPage");
    expect(types).toContain("FAQPage");
    expect(types).toContain("BreadcrumbList");
  });

  it("renders the same questions it publishes as schema", () => {
    // One shared constant feeds both, so the visible <dl> and the FAQPage
    // node cannot drift apart.
    const head = staticRouteHead("/tools/blueprint-targets");
    const faqNode = head.scripts
      .map((s) => JSON.parse(s.children))
      .find((n) => n["@type"] === "FAQPage");
    const schemaQuestions = (faqNode?.mainEntity ?? []).map(
      (e: { name: string }) => e.name,
    );
    expect(schemaQuestions).toEqual(VERDANT_BLUEPRINT_TARGETS_FAQ.map((f) => f.question));

    render(<BlueprintTargetsGuide />);
    for (const entry of VERDANT_BLUEPRINT_TARGETS_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
  });

  it("scopes the higher-runoff claim to EC, since pH can drift either way", () => {
    const answer =
      VERDANT_BLUEPRINT_TARGETS_FAQ.find((f) => f.question.includes("input feed or runoff"))
        ?.answer ?? "";
    expect(answer).toMatch(/runoff EC normally reads higher/i);
    expect(answer).toMatch(/drift in either direction/i);
  });
});

describe("BlueprintTargetsGuide horticultural claims", () => {
  const faqText = VERDANT_BLUEPRINT_TARGETS_FAQ.map((f) => f.answer).join(" ");

  it("makes no stretch/elongation claim about the night drop", () => {
    // Cooler nights INCREASE positive DIF, which generally promotes stem
    // elongation rather than suppressing it. An earlier draft claimed the
    // opposite; the claim is removed rather than reversed, because the
    // question does not need a growth-response mechanism to be answered.
    expect(faqText).not.toMatch(/stretch/i);
    expect(faqText).not.toMatch(/elongation/i);
  });

  it("keeps darkness and airflow in the dry-room guidance", () => {
    // dryPhaseCheckRules treats stagnant airflow as needs_review, and the care
    // guide specifies a dark, VENTILATED space. Saying only temperature and
    // humidity matter would make nominal readings look sufficient while damp
    // pockets raise mould risk.
    const dryAnswer =
      VERDANT_BLUEPRINT_TARGETS_FAQ.find((f) => f.question.includes("dry and cure"))?.answer ?? "";
    expect(dryAnswer).toMatch(/ventilat|airflow/i);
    expect(dryAnswer).toMatch(/dark/i);
    // "only" must be scoped to the numeric targets, never to what matters.
    expect(dryAnswer).not.toMatch(/only air temperature and humidity matter/i);

    render(<BlueprintTargetsGuide />);
    const harvest = screen.getByTestId("blueprint-targets-stage-harvest").textContent ?? "";
    expect(harvest).toMatch(/airflow/i);
  });
});

/**
 * contextual-pheno-comparison-panel-layout.test
 *
 * Desktop + mobile snapshot tests that lock:
 *  - top-level section/header ordering inside the panel
 *  - 2–4 plant card layout (count and deterministic order)
 *  - that the plant grid uses a responsive 1-col / md:2-col grid
 *
 * Uses structural fingerprints (testid sequences) rather than full HTML
 * dumps so the snapshots stay stable against Tailwind class churn.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import {
  buildContextualPhenoComparisonView,
  type ContextualPhenoPlantInput,
} from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/test/fixtures/contextualPhenoComparisonFixtures";

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

function setViewport({ width, height }: { width: number; height: number }) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

function topLevelTestIds(panel: HTMLElement): string[] {
  return Array.from(panel.children)
    .map((c) => (c as HTMLElement).getAttribute("data-testid"))
    .filter((v): v is string => Boolean(v));
}

function plantCardLabels(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="contextual-pheno-comparison-plant-"][data-plant-label]',
    ),
  ).map((el) => el.getAttribute("data-plant-label") ?? "");
}

describe("ContextualPhenoComparisonPanel layout snapshots", () => {
  afterEach(() => {
    cleanup();
  });

  describe("desktop viewport (1280×800)", () => {
    beforeEach(() => setViewport(DESKTOP));

    it("locks top-level header / section ordering with 3 demo plants", () => {
      const view = buildContextualPhenoComparisonView(
        CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
      );
      render(<ContextualPhenoComparisonPanel view={view} />);
      const panel = screen.getByTestId("contextual-pheno-comparison-panel");
      expect(topLevelTestIds(panel)).toMatchInlineSnapshot(`
        [
          "contextual-pheno-comparison-demo-banner",
          "contextual-pheno-comparison-caveat",
          "contextual-pheno-comparison-plant-count",
          "contextual-pheno-comparison-plant-grid",
          "contextual-pheno-comparison-source-summary",
        ]
      `);
    });

    it("renders 3 plant cards in deterministic label order inside an md:2-col grid", () => {
      const view = buildContextualPhenoComparisonView(
        CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
      );
      render(<ContextualPhenoComparisonPanel view={view} />);
      const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
      expect(grid.className).toContain("grid-cols-1");
      expect(grid.className).toContain("md:grid-cols-2");
      expect(plantCardLabels()).toEqual(["Alpha", "Bravo", "Charlie"]);
    });

    it("supports a 2-plant layout snapshot", () => {
      const inputs = CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS.slice(0, 2);
      const view = buildContextualPhenoComparisonView(inputs);
      render(<ContextualPhenoComparisonPanel view={view} />);
      expect(plantCardLabels()).toEqual(["Alpha", "Bravo"]);
      expect(
        screen.getByTestId("contextual-pheno-comparison-plant-count").textContent,
      ).toMatch(/2/);
    });

    it("supports a 4-plant layout snapshot", () => {
      const fourth: ContextualPhenoPlantInput = {
        ...CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS[0],
        plantId: "demo-plant-delta",
        plantLabel: "Delta",
        comparisonNotes: [],
      };
      const inputs = [
        ...CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
        fourth,
      ];
      const view = buildContextualPhenoComparisonView(inputs);
      render(<ContextualPhenoComparisonPanel view={view} />);
      expect(plantCardLabels()).toEqual([
        "Alpha",
        "Bravo",
        "Charlie",
        "Delta",
      ]);
    });
  });

  describe("mobile viewport (390×844)", () => {
    beforeEach(() => setViewport(MOBILE));

    it("preserves the same top-level ordering on mobile (single-column grid)", () => {
      const view = buildContextualPhenoComparisonView(
        CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
      );
      render(<ContextualPhenoComparisonPanel view={view} />);
      const panel = screen.getByTestId("contextual-pheno-comparison-panel");
      expect(topLevelTestIds(panel)).toMatchInlineSnapshot(`
        [
          "contextual-pheno-comparison-demo-banner",
          "contextual-pheno-comparison-caveat",
          "contextual-pheno-comparison-plant-count",
          "contextual-pheno-comparison-plant-grid",
          "contextual-pheno-comparison-source-summary",
        ]
      `);
      const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
      // Single-column default applies on mobile; md: breakpoint promotes to 2-col.
      expect(grid.className).toContain("grid-cols-1");
    });

    it("renders the plant cards in the same label order on mobile", () => {
      const view = buildContextualPhenoComparisonView(
        CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
      );
      render(<ContextualPhenoComparisonPanel view={view} />);
      expect(plantCardLabels()).toEqual(["Alpha", "Bravo", "Charlie"]);
    });
  });
});

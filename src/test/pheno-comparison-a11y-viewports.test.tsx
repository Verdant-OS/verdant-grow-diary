/**
 * pheno-comparison-a11y-viewports —
 *
 * Screen-reader / a11y regression for the selection-grade Pheno Comparison
 * preview at mobile (375px), tablet (768px), and desktop (1024px) widths.
 *
 * jsdom does not compute responsive layout; viewport width is set so
 * media-query-aware code branches match, but assertions target DOM presence +
 * accessible text. Playwright specs cover visible regression.
 *
 * Verifies at every viewport:
 *  - read-only / demo / not-real-telemetry disclaimers are discoverable
 *  - the confidence caveat + comparability verdict + reasons are readable
 *  - each candidate label, the six-source legend, and missing-data flags render
 *  - risky (thin/partial/stale/invalid) candidate cards never announce
 *    healthy/OK/success — and never a winner/keeper "pick"
 *  - zero interactive / write controls are exposed
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import PhenoComparison from "@/pages/PhenoComparison";
import { PHENO_COMPARISON_DEMO_INPUT } from "@/lib/phenoComparisonFixtures";
import { containsHealthyStatusLanguage } from "@/lib/phenoComparisonRules";
import { containsSelectionOverclaim } from "@/lib/phenoSelectionRules";

const VIEWPORTS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
}

// Demo candidates whose selection evidence is risky (partial / thin).
const RISKY_CANDIDATE_IDS = ["cand-2", "cand-3", "cand-4"];

for (const vp of VIEWPORTS) {
  describe(`PhenoComparison a11y — ${vp.name}`, () => {
    beforeEach(() => setViewport(vp.width, vp.height));
    afterEach(() => cleanup());

    it("exposes read-only / demo / not-live disclaimers", () => {
      render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
      expect(screen.getByTestId("pheno-comparison-readonly-badge").textContent).toMatch(
        /read-only/i,
      );
      expect(screen.getByTestId("pheno-comparison-sample-badge")).toBeTruthy();
      expect(screen.getByTestId("pheno-comparison-demo-banner").textContent).toMatch(
        /not real telemetry/i,
      );
      expect(screen.getByTestId("pheno-comparison-confidence-caveat")).toBeInTheDocument();
    });

    it("announces the comparability verdict + reasons", () => {
      render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
      const verdict = screen.getByTestId("pheno-comparability-verdict");
      expect(verdict.getAttribute("data-verdict")).toBe("not_comparable");
      expect(
        screen.getByTestId("pheno-comparability-reason-0").textContent?.length,
      ).toBeGreaterThan(0);
    });

    it("renders candidate labels, the six-source legend, and missing-data flags", () => {
      render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
      expect(screen.getByTestId("pheno-candidate-label-cand-1")).toBeTruthy();
      for (const key of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
        expect(screen.getByTestId(`pheno-source-legend-${key}`)).toBeTruthy();
      }
      expect(screen.getByTestId("pheno-flag-cand-3-no_photo")).toBeTruthy();
    });

    it("risky candidate cards never announce healthy/OK/success or a pick", () => {
      render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
      for (const id of RISKY_CANDIDATE_IDS) {
        const card = screen.getByTestId(`pheno-comparison-candidate-${id}`);
        const chip = within(card).getByTestId(`pheno-selection-strength-${id}`);
        expect(["caution", "danger"]).toContain(chip.getAttribute("data-tone"));
        const txt = card.textContent ?? "";
        expect(containsHealthyStatusLanguage(txt)).toBe(false);
        expect(containsSelectionOverclaim(txt)).toBe(false);
      }
    });

    it("exposes zero interactive / write controls (read-only, no writes)", () => {
      const { container } = render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
      expect(
        container.querySelectorAll(
          "button, a[href], input, select, textarea, form, [role='button']",
        ).length,
      ).toBe(0);
    });
  });
}

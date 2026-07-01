/**
 * pheno-comparison-hardening — hardening tests for the read-only
 * `/pheno-comparison` preview surface.
 *
 * Covers:
 *  1. renders from direct URL
 *  2. reload (unmount + remount) remains stable
 *  3. at least two candidates render
 *  4. missing-photo flag renders
 *  5. missing-sensor flag renders (candidate w/ zero snapshots)
 *  6. stale + invalid source labels render
 *  7. demo / sample / not-live copy renders
 *  8. confidence caveat copy renders
 *  9. legend covers all six allowed source labels
 * 10. never-healthy negative assertion — no "Healthy" / "All good"
 *     appears anywhere on the surface
 * 11. no write-style controls (button/form/input) render
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";
import {
  PHENO_COMPARISON_SENSOR_SOURCES,
  PHENO_SOURCE_LEGEND,
} from "@/lib/phenoComparisonRules";

// Safety: if the page ever tries to touch supabase, blow up loudly.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("PhenoComparison must not use supabase (read-only).");
      },
    },
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
        <Route path="/pheno-hunts/:id/compare" element={<PhenoComparison />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoComparison hardening", () => {
  it("renders from direct /pheno-comparison URL", () => {
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
  });

  it("survives an unmount+remount reload cycle", () => {
    const first = renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    first.unmount();
    cleanup();
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-comparison-grid")).toBeInTheDocument();
  });

  it("renders at least two side-by-side candidates", () => {
    renderAt("/pheno-comparison");
    const grid = screen.getByTestId("pheno-comparison-grid");
    const cards = within(grid).getAllByTestId(/^pheno-candidate-/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("renders missing-photo and missing-diary flags on incomplete candidates", () => {
    renderAt("/pheno-comparison");
    // Bravo lacks photos.
    expect(
      screen.getByTestId("pheno-candidate-demo-cand-bravo-no-photo"),
    ).toBeInTheDocument();
    // Charlie lacks photos and diary entries.
    const charlie = screen.getByTestId("pheno-candidate-demo-cand-charlie");
    expect(
      within(charlie).getByTestId(
        "pheno-candidate-demo-cand-charlie-no-photo",
      ),
    ).toBeInTheDocument();
    expect(within(charlie).getByTestId("missing-no_diary")).toBeInTheDocument();
  });

  it("renders stale + invalid source labels with untrusted styling", () => {
    renderAt("/pheno-comparison");
    const bravo = screen.getByTestId("pheno-candidate-demo-cand-bravo");
    expect(within(bravo).getAllByText(/Stale/i).length).toBeGreaterThan(0);
    expect(
      within(bravo).getByTestId("snapshot-sn-b-2-missing-stale_reading"),
    ).toBeInTheDocument();

    const charlie = screen.getByTestId("pheno-candidate-demo-cand-charlie");
    expect(within(charlie).getAllByText(/Invalid/i).length).toBeGreaterThan(0);
  });

  it("renders demo/sample/not-live and confidence caveat copy", () => {
    renderAt("/pheno-comparison");
    const banner = screen.getByTestId("pheno-comparison-demo-banner");
    expect(banner).toHaveTextContent(/demo/i);
    expect(banner).toHaveTextContent(/not live/i);

    const caveat = screen.getByTestId(
      "pheno-comparison-confidence-caveat",
    );
    expect(caveat).toHaveTextContent(/confidence/i);
    expect(caveat).toHaveTextContent(/evidence/i);

    expect(
      screen.getByTestId("pheno-comparison-read-only-badge"),
    ).toHaveTextContent(/read-only/i);
  });

  it("legend surfaces all six allowed sensor sources", () => {
    renderAt("/pheno-comparison");
    const legend = screen.getByTestId("pheno-comparison-source-legend");
    for (const src of PHENO_COMPARISON_SENSOR_SOURCES) {
      expect(within(legend).getByTestId(`legend-${src}`)).toBeInTheDocument();
    }
    // Legend definition itself must include all six.
    expect(PHENO_SOURCE_LEGEND.map((i) => i.source).sort()).toEqual(
      [...PHENO_COMPARISON_SENSOR_SOURCES].sort(),
    );
  });

  it("never renders healthy/all-good language (never-healthy invariant)", () => {
    const { container } = renderAt("/pheno-comparison");
    const text = container.textContent ?? "";
    // Denial phrases ("not treated as healthy") are OK — that's the caveat.
    // Affirmative claims must not appear.
    expect(text).not.toMatch(/\bis healthy\b/i);
    expect(text).not.toMatch(/\ball good\b/i);
    expect(text).not.toMatch(/\blooks healthy\b/i);
    expect(text).not.toMatch(/\bhealthy plant\b/i);
    expect(text).not.toMatch(/\bno issues detected\b/i);
  });

  it("renders no write-style controls (no button, form, or input)", () => {
    const { container } = renderAt("/pheno-comparison");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    // No affirmative write CTAs.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/add to action queue/i);
    expect(text).not.toMatch(/send to device/i);
    expect(text).not.toMatch(/save comparison/i);
    expect(text).not.toMatch(/import data/i);
  });
});

/**
 * pheno-comparison-a11y — consolidated accessibility test for the
 * read-only /pheno-comparison surface at mobile (375px) and tablet
 * (768px) widths.
 *
 * jsdom does not render responsive layout, so viewport checks assert
 * DOM presence + accessible names. Playwright specs cover the visible
 * regression separately.
 *
 * Verifies screen-reader labelling for:
 *  - read-only badge
 *  - candidate headers
 *  - comparability verdict / panel
 *  - empty-state alerts / statuses
 *  - missing photo state
 *  - missing sensor snapshot state
 *  - missing temp / RH / VPD flags
 *  - missing EC / pH / PPFD flags when relevant
 *  - stale / invalid evidence states
 *  - six-source legend
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { PHENO_COMPARISON_SENSOR_SOURCES } from "@/lib/phenoComparisonRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("PhenoComparison a11y test must not touch supabase.");
      },
    },
  ),
}));

const VIEWPORTS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-comparison"]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
      </Routes>
    </MemoryRouter>,
  );
}

for (const vp of VIEWPORTS) {
  describe(`PhenoComparison a11y — ${vp.name}`, () => {
    beforeEach(() => setViewport(vp.width, vp.height));
    afterEach(() => cleanup());

    it("main region exposes an accessible name via heading", () => {
      renderPage();
      // <main aria-labelledby="pheno-comparison-heading"> and the h1.
      expect(screen.getByRole("main", { name: /pheno comparison/i })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 1, name: /pheno comparison/i }),
      ).toBeInTheDocument();
    });

    it("read-only badge has status role + accessible name", () => {
      renderPage();
      const badge = screen.getByTestId("pheno-comparison-read-only-badge");
      expect(badge).toHaveAttribute("role", "status");
      expect(badge).toHaveAccessibleName(/read-only preview/i);
    });

    it("demo banner + comparability verdict expose status role with names", () => {
      renderPage();
      const banner = screen.getByTestId("pheno-comparison-demo-banner");
      expect(banner).toHaveAttribute("role", "status");
      expect(banner).toHaveAccessibleName(/demo/i);

      const verdict = screen.getByTestId("pheno-comparison-comparability-verdict");
      expect(verdict).toHaveAttribute("role", "status");
      expect(verdict).toHaveAccessibleName(/comparability/i);
    });

    it("candidate columns are labelled by their heading", () => {
      renderPage();
      // At least two labelled regions with candidate names.
      const alpha = screen.getByRole("region", { name: /alpha/i });
      const bravo = screen.getByRole("region", { name: /bravo/i });
      expect(alpha).toBeInTheDocument();
      expect(bravo).toBeInTheDocument();
      expect(within(alpha).getByRole("heading", { level: 2, name: /alpha/i })).toBeInTheDocument();
    });

    it("missing photo + missing sensor states expose status role", () => {
      renderPage();
      const bravoNoPhoto = screen.getByTestId("pheno-candidate-demo-cand-bravo-no-photo");
      expect(bravoNoPhoto).toHaveAttribute("role", "status");
      expect(bravoNoPhoto).toHaveAccessibleName(/no photo/i);

      // Charlie has invalid+null snapshot but non-empty snapshots array, so
      // "no sensor snapshot" doesn't render. Instead the invalid missing
      // flags render — verify those are also labelled via the missing list.
      const charlieMissing = screen.getByTestId("pheno-candidate-demo-cand-charlie-missing");
      expect(charlieMissing).toHaveAttribute("role", "status");
      expect(charlieMissing).toHaveAccessibleName(/missing context/i);
    });

    it("missing temp/RH/VPD/EC/pH/PPFD flags render on incomplete candidates", () => {
      renderPage();
      const charlie = screen.getByTestId("pheno-candidate-demo-cand-charlie");
      // Charlie has invalid snapshot with all metrics null.
      for (const code of [
        "missing_temp",
        "missing_rh",
        "missing_vpd",
        "missing_ec",
        "missing_ph",
        "missing_ppfd",
      ]) {
        expect(
          within(charlie).queryByTestId(`snapshot-sn-c-1-missing-${code}`),
        ).toBeInTheDocument();
      }
    });

    it("stale + invalid evidence states are visibly flagged", () => {
      renderPage();
      const bravo = screen.getByTestId("pheno-candidate-demo-cand-bravo");
      expect(
        within(bravo).getByTestId("snapshot-sn-b-2-missing-stale_reading"),
      ).toBeInTheDocument();

      const charlie = screen.getByTestId("pheno-candidate-demo-cand-charlie");
      expect(
        within(charlie).getByTestId("snapshot-sn-c-1-missing-invalid_reading"),
      ).toBeInTheDocument();
    });

    it("six-source legend exposes each source with an accessible name", () => {
      renderPage();
      const legend = screen.getByRole("list", {
        name: /sensor source legend/i,
      });
      for (const src of PHENO_COMPARISON_SENSOR_SOURCES) {
        const item = within(legend).getByTestId(`legend-${src}`);
        expect(item).toHaveAttribute("aria-label");
        const accessibleName = item.getAttribute("aria-label") ?? "";
        expect(accessibleName.length).toBeGreaterThan(0);
        if (src === "live") {
          expect(accessibleName).toMatch(/connected source/i);
          expect(accessibleName).not.toMatch(/\blive\b/i);
        } else {
          expect(accessibleName).toMatch(new RegExp(src, "i"));
        }
      }
    });
  });
}

it("keeps source-only live pheno evidence in a caution tone", () => {
  render(
    <PhenoComparisonView
      mode="live"
      inputs={[
        {
          candidateId: "a",
          sensorSnapshots: [
            {
              id: "source-only-live",
              source: "live",
              capturedAt: "2026-06-01T12:00:00Z",
              tempF: 75,
              rh: 55,
              vpd: 1.1,
            },
          ],
        },
        { candidateId: "b" },
      ]}
    />,
  );
  const badge = screen.getByTestId("snapshot-source-only-live-source");
  expect(badge).toHaveTextContent("Connected source (unverified)");
  expect(badge).toHaveClass("bg-amber-500/10");
  expect(badge).not.toHaveClass("bg-emerald-500/10");
  cleanup();
});

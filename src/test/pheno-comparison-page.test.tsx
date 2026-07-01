/**
 * pheno-comparison-page — read-only preview render tests.
 *
 * Covers:
 *  - route renders under BrowserRouter
 *  - at least two candidates render side-by-side
 *  - missing-photo, missing-sensor, stale, invalid flags render
 *  - stale + invalid source labels render
 *  - read-only badge renders
 *  - no Action Queue / device-control language appears
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";

// Safety: assert the page does not import supabase, AI, or write helpers.
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
        <Route
          path="/pheno-hunts/:id/compare"
          element={<PhenoComparison />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoComparison page", () => {
  it("renders at /pheno-comparison with read-only badge and demo banner", () => {
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(
      screen.getByTestId("pheno-comparison-read-only-badge"),
    ).toHaveTextContent(/read-only/i);
    expect(
      screen.getByTestId("pheno-comparison-demo-banner"),
    ).toHaveTextContent(/demo/i);
  });

  it("renders at /pheno-hunts/:id/compare", () => {
    renderAt("/pheno-hunts/abc123/compare");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
  });

  it("renders at least two candidates side-by-side", () => {
    renderAt("/pheno-comparison");
    expect(
      screen.getByTestId("pheno-candidate-demo-cand-alpha"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("pheno-candidate-demo-cand-bravo"),
    ).toBeInTheDocument();
  });

  it("flags missing photo, missing sensor snapshot, stale, and invalid readings", () => {
    renderAt("/pheno-comparison");

    // Bravo has no photos.
    const bravo = screen.getByTestId("pheno-candidate-demo-cand-bravo");
    expect(
      within(bravo).getByTestId("pheno-candidate-demo-cand-bravo-no-photo"),
    ).toBeInTheDocument();

    // Bravo has a stale reading — stale label visible.
    expect(within(bravo).getByText(/Stale/i)).toBeInTheDocument();

    // Charlie has an invalid reading + no diary/photos.
    const charlie = screen.getByTestId("pheno-candidate-demo-cand-charlie");
    expect(within(charlie).getByText(/Invalid/i)).toBeInTheDocument();
    expect(
      within(charlie).getByTestId("missing-no_diary"),
    ).toBeInTheDocument();
    expect(
      within(charlie).getByTestId(
        "pheno-candidate-demo-cand-charlie-no-photo",
      ),
    ).toBeInTheDocument();
  });

  it("renders trusted source labels (Live, Manual, CSV) for trusted readings", () => {
    renderAt("/pheno-comparison");
    const alpha = screen.getByTestId("pheno-candidate-demo-cand-alpha");
    expect(within(alpha).getByText("Live")).toBeInTheDocument();
    expect(within(alpha).getByText("Manual")).toBeInTheDocument();
    const bravo = screen.getByTestId("pheno-candidate-demo-cand-bravo");
    expect(within(bravo).getByText("CSV")).toBeInTheDocument();
  });

  it("does not use action queue / device control / automation language", () => {
    const { container } = renderAt("/pheno-comparison");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/action queue/i);
    expect(text).not.toMatch(/device control/i);
    expect(text).not.toMatch(/automation/i);
    expect(text).not.toMatch(/execute .* command/i);
    // No save / submit / import call-to-action buttons on this surface.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});

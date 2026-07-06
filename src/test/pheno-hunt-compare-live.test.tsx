/**
 * PhenoHuntCompare — live per-hunt comparison page states.
 *
 * The page reads a real hunt via usePhenoHuntCandidates (mocked here) and
 * renders the shared PhenoComparisonView in "live" mode. Read-only: this test
 * also asserts no write controls appear.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoHuntCandidatesState } from "@/hooks/usePhenoHuntCandidates";

const hookMock = vi.fn<() => UsePhenoHuntCandidatesState>();
vi.mock("@/hooks/usePhenoHuntCandidates", () => ({
  usePhenoHuntCandidates: () => hookMock(),
}));

import PhenoHuntCompare from "@/pages/PhenoHuntCompare";

function renderAt(state: UsePhenoHuntCandidatesState) {
  hookMock.mockReturnValue(state);
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/hunt-1/compare"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/compare" element={<PhenoHuntCompare />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => hookMock.mockReset());

describe("PhenoHuntCompare (live)", () => {
  it("shows a loading state while the hunt loads", () => {
    renderAt({ status: "loading", hunt: null, candidates: [], error: null });
    expect(screen.getByTestId("pheno-hunt-compare-loading")).toBeInTheDocument();
  });

  it("shows a read-only error state when the hunt cannot load", () => {
    renderAt({ status: "error", hunt: null, candidates: [], error: "Pheno hunt not found." });
    expect(screen.getByTestId("pheno-hunt-compare-error")).toHaveTextContent(/not found/i);
  });

  it("renders the live comparison (hunt name, no demo banner) with real candidates", () => {
    renderAt({
      status: "ok",
      hunt: { id: "hunt-1", name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
      candidates: [
        { candidateId: "p1", candidateLabel: "BD #1", plantLabel: "BD #1", stage: "flower" },
        { candidateId: "p2", candidateLabel: "BD #2", plantLabel: "BD #2", stage: "flower" },
      ],
      error: null,
    });

    const page = screen.getByTestId("pheno-comparison-page");
    expect(page).toHaveAttribute("data-mode", "live");
    expect(screen.getByTestId("pheno-comparison-live-hunt")).toHaveTextContent(/Blue Dream Hunt/);
    // Live mode never shows the demo-fixture disclaimer.
    expect(screen.queryByTestId("pheno-comparison-demo-banner")).not.toBeInTheDocument();
    // Both real candidates render.
    expect(screen.getByTestId("pheno-candidate-p1")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-candidate-p2")).toBeInTheDocument();
    // Read-only: no write controls.
    expect(document.querySelectorAll("button, form, input, textarea, select").length).toBe(0);
  });
});

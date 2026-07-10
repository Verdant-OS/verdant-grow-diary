/**
 * pheno-comparison-incomplete-evidence — asserts nested comparison surfaces
 * do NOT render ranking / verdict / keeper-conclusion UI when the hunt is
 * not comparison-ready. Setup complete ≠ Comparison-ready.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import type { UsePhenoHuntCandidatesState } from "@/hooks/usePhenoHuntCandidates";

const hookMock = vi.fn<() => UsePhenoHuntCandidatesState>();
vi.mock("@/hooks/usePhenoHuntCandidates", () => ({
  usePhenoHuntCandidates: () => hookMock(),
}));

import PhenoHuntCompare from "@/pages/PhenoHuntCompare";

const HUNT_ID = "hunt-inc-1";

function baseCandidate(id: string): PhenoCandidateInput {
  return {
    candidateId: id,
    candidateLabel: id.toUpperCase(),
    growLabel: "Grow",
    tentLabel: "Tent",
    plantLabel: id,
    strain: "BD",
    stage: "flower",
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [],
  };
}

function mount(state: Partial<UsePhenoHuntCandidatesState>) {
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: HUNT_ID, name: "Inc", growId: "g", tentId: "t" },
    candidates: [],
    error: null,
    ...state,
  } as UsePhenoHuntCandidatesState);
  return render(
    <MemoryRouter initialEntries={[`/pheno-hunts/${HUNT_ID}/compare`]}>
      <Routes>
        <Route path="/pheno-hunts/:id/compare" element={<PhenoHuntCompare />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoHuntCompare — incomplete evidence hides conclusions", () => {
  afterEach(() => {
    cleanup();
    hookMock.mockReset();
  });

  it("nested comparison view receives allowConclusions=false when not ready", () => {
    mount({ candidates: [baseCandidate("p1"), baseCandidate("p2")] });
    const page = screen.getByTestId("pheno-comparison-page");
    expect(page.getAttribute("data-allow-conclusions")).toBe("false");
    // Warning banner remains the primary label.
    expect(
      screen.getByTestId("pheno-hunt-compare-readiness-warning"),
    ).toBeVisible();
  });

  it("no ranking / verdict / keeper conclusion language rendered when not ready", () => {
    mount({ candidates: [baseCandidate("p1"), baseCandidate("p2")] });
    const body = document.body.textContent ?? "";
    const forbidden: RegExp[] = [
      /\bwinner\b/i,
      /winner\s+is/i,
      /winning\s+candidate/i,
      /best\s+candidate/i,
      /best\s+pheno/i,
      /top\s+candidate/i,
      /ranked\s+candidate/i,
      /candidate\s+ranking/i,
      /final\s+ranking/i,
      /final\s+verdict/i,
      /comparison\s+verdict/i,
      /recommended\s+keeper/i,
      /keeper\s+recommendation/i,
      /keeper\s+selected/i,
      /keeper\s+confirmed/i,
      /selection\s+winner/i,
      /selection[- ]?ready/i,
      /ready\s+to\s+select/i,
      /ai\s+picked/i,
      /ai\s+picks?\s+winners?/i,
      /guaranteed\s+keeper/i,
      /guaranteed\s+yield/i,
      /automated\s+breeding/i,
    ];
    for (const pat of forbidden) {
      expect(pat.test(body), `unexpected copy: ${pat}`).toBe(false);
    }
  });

  it("comparison-ready hunt allows conclusions and hides warning banner", () => {
    const ready = (id: string): PhenoCandidateInput => ({
      ...baseCandidate(id),
      expression: {
        noseNote: "gas",
        aromaDescriptors: ["citrus"],
        smokeTest: {
          flavorDescriptors: ["gas"],
          effectDescriptors: ["couchlock"],
          smoothness: 4,
          potencyImpression: 4,
          verdict: "smooth",
        },
      },
    });
    mount({ candidates: [ready("p1"), ready("p2")] });
    expect(
      screen.queryByTestId("pheno-hunt-compare-readiness-warning"),
    ).toBeNull();
    const page = screen.getByTestId("pheno-comparison-page");
    expect(page.getAttribute("data-allow-conclusions")).toBe("true");
  });
});

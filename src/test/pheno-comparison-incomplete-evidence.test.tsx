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

// Packet coverage is exercised by its own suites; here it stays disabled so
// these tests keep testing their original axis without a QueryClient.
vi.mock("@/hooks/usePhenoEvidencePackets", () => ({
  usePhenoEvidencePackets: () => ({
    status: "disabled" as const,
    packets: new Map(),
    truncated: false,
  }),
}));


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
    expect(/best candidate is/i.test(body)).toBe(false);
    expect(/best pheno is/i.test(body)).toBe(false);
    expect(/the winner is/i.test(body)).toBe(false);
    expect(/recommended keeper/i.test(body)).toBe(false);
    expect(/guaranteed keeper/i.test(body)).toBe(false);
    expect(/guaranteed yield/i.test(body)).toBe(false);
    expect(/ai picks winners?/i.test(body)).toBe(false);
    expect(/automated breeding/i.test(body)).toBe(false);
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

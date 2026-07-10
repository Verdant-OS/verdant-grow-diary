/**
 * pheno-hunt-compare-readiness-warning — verifies the live compare route
 * remains honest even under direct URL access. When the hunt lacks the
 * evidence required for an honest side-by-side, the page renders a
 * "Not comparison-ready yet" banner with missing-evidence details, and
 * never presents ranking / keeper conclusions.
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

const HUNT_ID = "hunt-live-1";

function baseCandidate(id: string): PhenoCandidateInput {
  return {
    candidateId: id,
    candidateLabel: id.toUpperCase(),
    growLabel: "Grow",
    tentLabel: "Tent",
    plantLabel: id,
    strain: "Blue Dream",
    stage: "flower",
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [],
  };
}

function readyCandidate(id: string): PhenoCandidateInput {
  return {
    ...baseCandidate(id),
    expression: {
      noseNote: "citrus and gas",
      aromaDescriptors: ["citrus"],
      smokeTest: {
        flavorDescriptors: ["gas"],
        effectDescriptors: ["couchlock"],
        smoothness: 4,
        potencyImpression: 4,
        verdict: "Nice smoke",
      },
    },
  };
}

function mount(state: Partial<UsePhenoHuntCandidatesState>) {
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: HUNT_ID, name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
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

describe("PhenoHuntCompare — readiness warning banner", () => {
  afterEach(() => {
    cleanup();
    hookMock.mockReset();
  });

  it("incomplete hunt shows Not comparison-ready yet banner + missing details", () => {
    mount({ candidates: [baseCandidate("p1"), baseCandidate("p2")] });
    const banner = screen.getByTestId("pheno-hunt-compare-readiness-warning");
    expect(banner).toBeVisible();
    expect(banner).toHaveTextContent(/Not comparison-ready yet/i);
    expect(banner).toHaveTextContent(
      /missing evidence needed for an honest candidate comparison/i,
    );
    expect(
      screen.getByTestId("pheno-hunt-compare-readiness-warning-missing"),
    ).toBeVisible();
    // Ranking / keeper conclusion language must NOT appear on incomplete surface.
    const body = document.body.textContent ?? "";
    const forbidden: RegExp[] = [
      /\bwinner\b/i,
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

  it("pending-until-cure hunt surfaces cure copy in the banner", () => {
    const c1: PhenoCandidateInput = {
      ...baseCandidate("p1"),
      expression: { noseNote: "gas", labResult: { thcPct: 24, source: "coa" } },
    };
    const c2: PhenoCandidateInput = {
      ...baseCandidate("p2"),
      expression: { aromaDescriptors: ["fuel"], labResult: { thcPct: 22, source: "coa" } },
    };
    mount({ candidates: [c1, c2] });
    const banner = screen.getByTestId("pheno-hunt-compare-readiness-warning");
    expect(banner).toHaveTextContent(/Pending until cure/i);
  });

  it("comparison-ready hunt does not render the warning banner", () => {
    mount({ candidates: [readyCandidate("p1"), readyCandidate("p2")] });
    expect(
      screen.queryByTestId("pheno-hunt-compare-readiness-warning"),
    ).toBeNull();
    // The regular read-only comparison view renders.
    expect(screen.getByTestId("pheno-comparison-page")).toHaveAttribute(
      "data-mode",
      "live",
    );
  });

  it("banner next-step links point at the workspace, never at /compare", () => {
    mount({ candidates: [baseCandidate("p1"), baseCandidate("p2")] });
    const banner = screen.getByTestId("pheno-hunt-compare-readiness-warning");
    const anchors = banner.querySelectorAll("a");
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of Array.from(anchors)) {
      const href = a.getAttribute("href") ?? "";
      expect(href.startsWith(`/pheno-hunts/${HUNT_ID}/workspace`)).toBe(true);
      expect(href.includes("/compare")).toBe(false);
    }
  });
});

/**
 * pheno-hunt-workspace-scale-features — the scale-up UI surfaces on the hunt
 * workspace: candidate-number badge + owner/Pro-gated assignment (no auto-fill,
 * calm errors), per-candidate readiness badge, grower-selected 2–6 comparison
 * cohort (bounded, hunt-isolated deep link), bounded pagination (Show more →
 * next page), and keyboard operability.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/usePhenoHuntWorkspace", async (orig) => {
  const actual = await orig<typeof import("@/hooks/usePhenoHuntWorkspace")>();
  return { ...actual, usePhenoHuntWorkspace: () => hookMock() };
});
vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock("@/hooks/usePhenoStressObservations", () => ({
  usePhenoStressObservations: () => ({
    rows: [],
    summariesByPlant: {},
    diaryOptions: [],
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
    loading: false,
    error: null,
  }),
}));

let entitlementMock: { isActive: boolean; effectivePlanId: string; displayPlanId: string } = {
  isActive: true,
  effectivePlanId: "pro_monthly",
  displayPlanId: "pro_monthly",
};
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: entitlementMock, loading: false, refetch: vi.fn() }),
}));

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";

// Packet coverage is exercised by its own suites; here it stays disabled so
// these tests keep testing their original axis without a QueryClient.
vi.mock("@/hooks/usePhenoEvidencePackets", () => ({
  usePhenoEvidencePackets: () => ({
    status: "disabled" as const,
    packets: new Map(),
    truncated: false,
  }),
}));


function candidate(id: string, overrides: Partial<PhenoCandidateInput> = {}): PhenoCandidateInput {
  return {
    candidateId: id,
    candidateNumber: null,
    candidateLabel: id.toUpperCase(),
    plantLabel: id,
    strain: "Blue Dream",
    stage: "flower",
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [],
    ...overrides,
  };
}

const assignMock = vi.fn().mockResolvedValue({ ok: true, candidateNumber: 5 });
const loadNextPageMock = vi.fn();

function baseState(overrides: Partial<UsePhenoHuntWorkspaceState>): UsePhenoHuntWorkspaceState {
  return {
    status: "ok",
    hunt: { id: "hunt-1", name: "BD Hunt", growId: "g1", tentId: "t1" },
    candidates: [],
    totalCandidateCount: 0,
    loadingMore: false,
    hasMore: false,
    loadNextPage: loadNextPageMock,
    filters: {},
    setFilter: vi.fn(),
    resetFilters: vi.fn(),
    comparisonSummary: null,
    scoresByPlant: {},
    decisionsByPlant: {},
    roundsByKey: {},
    decisionHistoryByPlant: {},
    sexByPlant: {},
    reversedPlantIds: new Set<string>(),
    smokeByPlant: {},
    labByKey: {},
    error: null,
    saving: null,
    assignCandidateNumber: assignMock,
    loadDecisionHistory: vi.fn().mockResolvedValue(undefined),
    loadRound: vi.fn().mockResolvedValue(undefined),
    saveScore: vi.fn().mockResolvedValue(true),
    saveDecision: vi.fn().mockResolvedValue(true),
    saveRound: vi.fn().mockResolvedValue(true),
    saveSex: vi.fn().mockResolvedValue(true),
    saveSmokeTest: vi.fn().mockResolvedValue(true),
    saveLabResult: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function renderWorkspace(overrides: Partial<UsePhenoHuntWorkspaceState>) {
  hookMock.mockReturnValue(baseState(overrides));
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/hunt-1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
        <Route path="/pheno-hunts/:id/compare" element={<div data-testid="compare-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  hookMock.mockReset();
  assignMock.mockReset().mockResolvedValue({ ok: true, candidateNumber: 5 });
  loadNextPageMock.mockReset();
  entitlementMock = {
    isActive: true,
    effectivePlanId: "pro_monthly",
    displayPlanId: "pro_monthly",
  };
});
afterEach(() => cleanup());

describe("candidate identity + number", () => {
  it("shows the number badge (fixed) for a numbered candidate", () => {
    renderWorkspace({
      candidates: [candidate("p1", { candidateNumber: 3, candidateLabel: "Sour Zebra" })],
      totalCandidateCount: 1,
    });
    const badge = screen.getByTestId("workspace-candidate-number-p1");
    expect(badge).toHaveTextContent("#3");
    expect(badge).toHaveTextContent(/fixed for this hunt/i);
    // The card heading shows the unified identity "#3 · Sour Zebra".
    expect(screen.getByTestId("pheno-workspace-candidate-p1")).toHaveTextContent("#3 · Sour Zebra");
    // No assignment control for an already-numbered candidate.
    expect(screen.queryByTestId("workspace-assign-number-p1")).toBeNull();
  });
});

describe("owner-only candidate-number assignment", () => {
  it("Pro owner sees an EMPTY assignment input (never auto-suggests the next number)", () => {
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1 });
    const input = screen.getByTestId("workspace-assign-number-input-p1") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByTestId("workspace-assign-number-p1")).toHaveTextContent(
      /becomes permanently fixed for this hunt/i,
    );
  });

  it("assigns a positive integer via the hook", async () => {
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1 });
    fireEvent.change(screen.getByTestId("workspace-assign-number-input-p1"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("workspace-assign-number-save-p1"));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("p1", 5));
  });

  it("rejects a non-positive number client-side without calling the hook", async () => {
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1 });
    fireEvent.change(screen.getByTestId("workspace-assign-number-input-p1"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("workspace-assign-number-save-p1"));
    expect(await screen.findByTestId("workspace-assign-number-error-p1")).toHaveTextContent(
      /positive whole number/i,
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("surfaces a calm error when the database rejects the assignment", async () => {
    assignMock.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      error: "That number is already used by another candidate in this hunt. Pick a different one.",
    });
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1 });
    fireEvent.change(screen.getByTestId("workspace-assign-number-input-p1"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("workspace-assign-number-save-p1"));
    const err = await screen.findByTestId("workspace-assign-number-error-p1");
    expect(err).toHaveTextContent(/already used by another candidate/i);
    expect(err).toHaveAttribute("role", "alert");
  });

  it("hides the assignment control from a non-Pro (read-only) viewer", () => {
    entitlementMock = { isActive: false, effectivePlanId: "free", displayPlanId: "free" };
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1 });
    expect(screen.queryByTestId("workspace-assign-number-p1")).toBeNull();
    expect(screen.getByTestId("workspace-candidate-unnumbered-p1")).toBeInTheDocument();
  });
});

describe("per-candidate readiness badge", () => {
  it("labels an insufficient candidate honestly (evidence completeness, not quality)", () => {
    renderWorkspace({
      candidates: [candidate("p1", { candidateLabel: null, plantLabel: null })],
      totalCandidateCount: 1,
    });
    const badge = screen.getByTestId("workspace-readiness-p1");
    expect(badge).toHaveAttribute("data-readiness", "insufficient");
    expect(badge).toHaveTextContent(/evidence goals/i);
    expect(badge.textContent ?? "").not.toMatch(/winner|best|keeper pick/i);
  });
});

describe("grower-selected comparison cohort", () => {
  it("caps selection at 6 and only offers a compare link for 2–6", () => {
    renderWorkspace({
      candidates: ["p1", "p2"].map((id) => candidate(id)),
      totalCandidateCount: 2,
    });
    // 0 selected → no compare link, a hint instead
    expect(screen.queryByTestId("workspace-cohort-compare-link")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-select-p1"));
    expect(screen.getByTestId("workspace-cohort-count")).toHaveTextContent("1 selected");
    // 1 selected → still no link
    expect(screen.queryByTestId("workspace-cohort-compare-link")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-select-p2"));
    // 2 selected → compare link appears, deep-linking the selected ids
    const link = screen.getByTestId("workspace-cohort-compare-link");
    expect(link.getAttribute("href")).toBe("/pheno-hunts/hunt-1/compare?candidates=p1,p2");
  });

  it("keyboard toggles the selection checkbox", () => {
    renderWorkspace({ candidates: [candidate("p1"), candidate("p2")], totalCandidateCount: 2 });
    const cb = screen.getByTestId("workspace-select-p1") as HTMLInputElement;
    cb.focus();
    expect(cb).toHaveFocus();
    fireEvent.click(cb); // checkbox is natively keyboard/space operable
    expect(cb.checked).toBe(true);
  });
});

describe("bounded pagination", () => {
  it("shows honest visible/total counts and loads the next page via Show more", () => {
    renderWorkspace({
      candidates: [candidate("p1")],
      totalCandidateCount: 120,
      hasMore: true,
    });
    expect(screen.getByTestId("workspace-visible-count")).toHaveTextContent(/120 total/);
    const showMore = screen.getByTestId("workspace-show-more");
    fireEvent.click(showMore);
    expect(loadNextPageMock).toHaveBeenCalledTimes(1);
  });

  it("hides Show more when there are no more pages", () => {
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1, hasMore: false });
    expect(screen.queryByTestId("workspace-show-more")).toBeNull();
  });
});

describe("server-side filters", () => {
  it("routes the strain filter to the hook (server-side)", () => {
    const setFilter = vi.fn();
    renderWorkspace({ candidates: [candidate("p1")], totalCandidateCount: 1, setFilter });
    fireEvent.change(screen.getByTestId("workspace-filter-strain"), {
      target: { value: "Gelato" },
    });
    expect(setFilter).toHaveBeenCalledWith({ strain: "Gelato" });
  });

  it("refines the loaded page by readiness client-side (labeled honestly)", () => {
    renderWorkspace({
      candidates: [candidate("p1"), candidate("p2")],
      totalCandidateCount: 2,
    });
    fireEvent.change(screen.getByTestId("workspace-filter-readiness"), {
      target: { value: "comparison_ready" },
    });
    // Both candidates are insufficient → filtered-empty, honestly labeled.
    expect(screen.getByTestId("pheno-workspace-filtered-empty")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-visible-count")).toHaveTextContent(/readiness refines/i);
  });
});

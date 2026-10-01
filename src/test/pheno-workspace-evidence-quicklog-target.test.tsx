/**
 * #1005 — the workspace's "Record <goal> evidence" handoff targets the
 * candidate plant's OWN stored grow/tent, never the hunt's, and never fires
 * for an unresolved target.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import { buildPhenoCandidateEvidencePacket } from "@/lib/phenoEvidencePacket";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => hookMock(),
}));

type TentsState = {
  data: Array<{ id: string; grow_id: string | null }> | undefined;
  isError: boolean;
  refetch: () => Promise<unknown>;
};
const tentsState: { current: TentsState } = {
  current: { data: [], isError: false, refetch: () => Promise.resolve() },
};
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => tentsState.current,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      effectivePlanId: "pro_monthly",
      isActive: true,
      source: "subscription",
      hadProAccess: true,
    },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval: vi.fn().mockResolvedValue(true),
  }),
}));

const PLANT = "plant-a";
const GOALS = ["structure", "aroma"];

vi.mock("@/hooks/usePhenoEvidencePackets", () => ({
  usePhenoEvidencePackets: () => ({
    status: "ready" as const,
    packets: new Map([
      [
        "plant-a",
        buildPhenoCandidateEvidencePacket({
          huntId: "h1",
          plantId: "plant-a",
          configuredGoals: ["structure", "aroma"],
          rows: [],
        }),
      ],
    ]),
    truncated: false,
  }),
}));

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";

function candidate(growId: string | null, tentId: string | null): PhenoCandidateInput {
  return {
    candidateId: PLANT,
    candidateLabel: "LP-01",
    plantLabel: "Plant A",
    growLabel: "Grow",
    tentLabel: "Tent",
    growId,
    tentId,
    strain: "GG4",
    stage: "flower",
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [],
  };
}

function renderWorkspace(c: PhenoCandidateInput) {
  const state = {
    status: "ok",
    // The HUNT's grow/tent deliberately differ from the candidate's.
    hunt: {
      id: "h1",
      name: "Hunt",
      growId: "g-hunt",
      tentId: "t-hunt",
      evidenceGoals: GOALS,
    },
    candidates: [c],
    totalCandidateCount: 1,
    loadingMore: false,
    loadMoreError: null,
    hasMore: false,
    loadNextPage: vi.fn(),
    reload: vi.fn(),
    filters: {},
    setFilter: vi.fn(),
    resetFilters: vi.fn(),
    comparisonSummary: null,
    scoresByPlant: {},
    decisionsByPlant: {},
    roundsByKey: {},
    roundLoadStates: {},
    decisionHistoryByPlant: {},
    sexByPlant: {},
    reversedPlantIds: new Set<string>(),
    clonedPlantIds: new Set<string>(),
    smokeByPlant: {},
    labByKey: {},
    error: null,
    saving: null,
    assignCandidateNumber: vi.fn(),
    loadDecisionHistory: vi.fn().mockResolvedValue(undefined),
    loadRound: vi.fn().mockResolvedValue(undefined),
    saveScore: vi.fn(),
    saveDecision: vi.fn(),
    saveRound: vi.fn(),
    saveSex: vi.fn(),
    saveSmokeTest: vi.fn(),
    saveLabResult: vi.fn(),
    deleteLabResult: vi.fn(),
  } as unknown as UsePhenoHuntWorkspaceState;
  hookMock.mockImplementation(() => state);
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

const COVERAGE = `workspace-evidence-coverage-${PLANT}`;
const listener = vi.fn();

beforeEach(() => {
  hookMock.mockReset();
  listener.mockReset();
  tentsState.current = {
    data: [
      { id: "t-a", grow_id: "g-a" },
      { id: "t-hunt", grow_id: "g-hunt" },
    ],
    isError: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
  window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
});

afterEach(() => {
  window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
  cleanup();
});

describe("workspace evidence → Quick Log target (#1005)", () => {
  it("prefills the plant's own stored grow and tent, never the hunt's", () => {
    renderWorkspace(candidate("g-a", "t-a"));
    fireEvent.click(screen.getByTestId(`${COVERAGE}-record-structure`));
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      plantId: PLANT,
      growId: "g-a",
      tentId: "t-a",
      phenoHuntId: "h1",
      phenoEvidenceGoal: "structure",
      source: "pheno-evidence-goal",
    });
  });

  it("a tentless candidate passes its own grow with tent null, deferring to Quick Log", () => {
    renderWorkspace(candidate("g-a", null));
    fireEvent.click(screen.getByTestId(`${COVERAGE}-record-aroma`));
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      plantId: PLANT,
      growId: "g-a",
      tentId: null,
      suggestSnapshot: false,
    });
  });

  it("a missing or archived tent blocks the handoff and offers Review plant", () => {
    renderWorkspace(candidate("g-a", "t-archived-or-gone"));
    expect(screen.queryByTestId(`${COVERAGE}-record-structure`)).toBeNull();
    const status = screen.getByTestId(`${COVERAGE}-target`);
    expect(status).toHaveAttribute("data-target-state", "tent_unavailable");
    expect(status).toHaveTextContent("This plant's tent is archived or no longer available.");
    expect(screen.getByTestId(`${COVERAGE}-target-review`)).toHaveAttribute(
      "href",
      `/plants/${PLANT}`,
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("a tent that belongs to another grow is blocked, never re-targeted", () => {
    renderWorkspace(candidate("g-a", "t-hunt"));
    expect(screen.queryByTestId(`${COVERAGE}-record-structure`)).toBeNull();
    expect(screen.getByTestId(`${COVERAGE}-target`)).toHaveAttribute(
      "data-target-state",
      "mismatch",
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("while the tent catalog loads, the handoff waits instead of guessing", () => {
    tentsState.current = { ...tentsState.current, data: undefined, isError: false };
    renderWorkspace(candidate("g-a", "t-a"));
    expect(screen.queryByTestId(`${COVERAGE}-record-structure`)).toBeNull();
    expect(screen.getByTestId(`${COVERAGE}-target`)).toHaveAttribute(
      "data-target-state",
      "pending",
    );
    expect(screen.queryByTestId(`${COVERAGE}-target-review`)).toBeNull();
  });

  it("a failed tent catalog read offers Retry, not a configuration problem", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    tentsState.current = { data: undefined, isError: true, refetch };
    renderWorkspace(candidate("g-a", "t-a"));
    expect(screen.getByTestId(`${COVERAGE}-target`)).toHaveAttribute(
      "data-target-state",
      "catalog_error",
    );
    expect(screen.queryByTestId(`${COVERAGE}-target-review`)).toBeNull();
    fireEvent.click(screen.getByTestId(`${COVERAGE}-target-retry`));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

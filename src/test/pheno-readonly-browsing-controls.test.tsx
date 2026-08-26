/**
 * Read-only browsing stays browsable (Codex review, PR #1139).
 *
 * A lapsed-Pro grower gets disabled EDITORS, not a disabled page: the
 * workspace pages candidates 30 at a time, so if the search/filter bar or
 * "show more" sat inside the disabled fieldset, records past the first page
 * would be unreachable — contradicting the banner's "Your records stay
 * visible." These tests pin the fence line: mutation controls disabled,
 * browsing controls (filters, pagination, CSV export, keeper filter) enabled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { UsePhenoKeepersState } from "@/hooks/usePhenoKeepers";

// Lapsed Pro: the allowReadOnly route path admits them for viewing, but
// canWriteFeatureData resolves false, so every editor fence engages.
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      effectivePlanId: null,
      isActive: false,
      source: "none",
      hadProAccess: true,
    },
    refetch: () => {},
  }),
}));

const workspaceMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => workspaceMock(),
  // The page renders this in the "Load up to N more" label.
  CANDIDATE_PAGE_SIZE: 30,
}));
const keepersMock = vi.fn<() => UsePhenoKeepersState>();
vi.mock("@/hooks/usePhenoKeepers", () => ({
  usePhenoKeepers: () => keepersMock(),
}));
vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval: vi.fn().mockResolvedValue(false),
  }),
}));
vi.mock("@/hooks/usePhenoEvidencePackets", () => ({
  usePhenoEvidencePackets: () => ({
    status: "disabled" as const,
    packets: new Map(),
    truncated: false,
  }),
}));

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";
import PhenoKeepersPage from "@/pages/PhenoKeepersPage";

const READY = { status: "ready", error: null } as const;

function workspaceState(): UsePhenoHuntWorkspaceState {
  return {
    status: "ok",
    hunt: { id: "h1", name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
    candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
    totalCandidateCount: 40,
    loadingMore: false,
    loadMoreError: null,
    hasMore: true,
    loadNextPage: vi.fn(),
    reload: vi.fn(),
    filters: {},
    setFilter: vi.fn(),
    resetFilters: vi.fn(),
    comparisonSummary: null,
    scoresByPlant: {},
    decisionsByPlant: {},
    roundsByKey: {},
    roundLoadStates: {
      veg: READY,
      early_flower: READY,
      mid_flower: READY,
      late_flower: READY,
      post_cure: READY,
    },
    decisionHistoryByPlant: {},
    sexByPlant: {},
    reversedPlantIds: new Set<string>(),
    clonedPlantIds: new Set<string>(),
    smokeByPlant: {},
    labByKey: {},
    error: null,
    saving: null,
    assignCandidateNumber: vi.fn().mockResolvedValue({ ok: true, candidateNumber: 1 }),
    loadDecisionHistory: vi.fn().mockResolvedValue(undefined),
    loadRound: vi.fn().mockResolvedValue(undefined),
    saveScore: vi.fn().mockResolvedValue(true),
    saveDecision: vi.fn().mockResolvedValue(true),
    saveRound: vi.fn().mockResolvedValue(true),
    saveSex: vi.fn().mockResolvedValue(true),
    saveSmokeTest: vi.fn().mockResolvedValue(true),
    saveLabResult: vi.fn().mockResolvedValue(true),
    deleteLabResult: vi.fn().mockResolvedValue(true),
  };
}

function keeper(id: string, name: string) {
  return {
    id,
    huntId: "h1",
    sourcePlantId: `${id}-src`,
    keeperName: name,
    note: null,
    createdAt: null,
  };
}

function keepersState(): UsePhenoKeepersState {
  return {
    status: "ok",
    hunt: { id: "h1", name: "Loud Hunt", growId: "g1", tentId: "t1" },
    candidates: [{ candidateId: "p1", candidateLabel: "GMO #1" }],
    // 9 keepers so the browse filter (lineage > 8) renders.
    keepers: Array.from({ length: 9 }, (_, i) => keeper(`k${i + 1}`, `Keeper ${i + 1}`)),
    clonesByKeeper: {},
    crosses: [],
    reversals: [],
    reversedKeeperIds: [],
    sexByPlant: {},
    decisionsByPlant: {},
    error: null,
    saving: false,
    reload: vi.fn(),
    promoteToKeeper: vi.fn().mockResolvedValue(true),
    addKeeperClone: vi.fn().mockResolvedValue(true),
    markReversed: vi.fn().mockResolvedValue(true),
    saveCross: vi.fn().mockResolvedValue(true),
    saveStabilityRuns: vi.fn().mockResolvedValue(true),
    growOutPlantsById: {},
    linkGrowOutPlant: vi.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  workspaceMock.mockReset();
  keepersMock.mockReset();
});

describe("PhenoHuntWorkspace — read-only keeps browsing live", () => {
  function renderWorkspace() {
    workspaceMock.mockImplementation(workspaceState);
    render(
      <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
        <Routes>
          <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("filters, pagination, and CSV export stay enabled behind the banner", () => {
    renderWorkspace();
    expect(screen.getByTestId("pheno-workspace-readonly-banner")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-filter-text")).toBeEnabled();
    expect(screen.getByTestId("workspace-filter-strain")).toBeEnabled();
    expect(screen.getByTestId("workspace-filter-decision")).toBeEnabled();
    expect(screen.getByTestId("workspace-show-more")).toBeEnabled();
    expect(screen.getByTestId("workspace-export-csv")).toBeEnabled();
  });

  it("editors stay fenced: candidate save and setup controls are disabled", () => {
    renderWorkspace();
    expect(screen.getByTestId("workspace-save-p1")).toBeDisabled();
  });
});

describe("PhenoKeepersPage — read-only keeps browsing live", () => {
  function renderKeepers() {
    keepersMock.mockImplementation(keepersState);
    render(
      <MemoryRouter initialEntries={["/pheno-hunts/h1/keepers"]}>
        <Routes>
          <Route path="/pheno-hunts/:id/keepers" element={<PhenoKeepersPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("the keeper filter stays enabled while promote stays fenced", () => {
    renderKeepers();
    expect(screen.getByTestId("pheno-keepers-readonly-banner")).toBeInTheDocument();
    expect(screen.getByTestId("keepers-filter")).toBeEnabled();
    expect(screen.getByTestId("keepers-promote-save")).toBeDisabled();
    expect(screen.getByTestId("keepers-promote-plant")).toBeDisabled();
  });
});

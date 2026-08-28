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
import { render, screen, fireEvent } from "@testing-library/react";
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
// Stable reference so tests can assert the herm queue handler is NEVER
// reached in read-only mode — jsdom does not honour fieldset-disabled on
// synthetic clicks, so this exercises the handler substitution, not the DOM.
const { queueRemovalMock } = vi.hoisted(() => ({
  queueRemovalMock: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval: queueRemovalMock,
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

// Module-level mutation mocks so read-only tests can assert none is ever
// reached, even by synthetic events that bypass fieldset-disabled in jsdom.
const promoteToKeeper = vi.fn().mockResolvedValue(true);
const saveCross = vi.fn().mockResolvedValue(true);
const addKeeperClone = vi.fn().mockResolvedValue(true);
const markReversed = vi.fn().mockResolvedValue(true);
const saveStabilityRuns = vi.fn().mockResolvedValue(true);

function keepersState(): UsePhenoKeepersState {
  return {
    status: "ok",
    hunt: { id: "h1", name: "Loud Hunt", growId: "g1", tentId: "t1" },
    candidates: [{ candidateId: "p1", candidateLabel: "GMO #1" }],
    // 9 keepers so the browse filter (lineage > 8) renders.
    keepers: Array.from({ length: 9 }, (_, i) => keeper(`k${i + 1}`, `Keeper ${i + 1}`)),
    // k1 carries a plant-linked clone with recorded traits so the grow-out
    // handoff renders its accept button — the accept path is a mutation
    // (appends a stability run) and must be pinned in read-only mode.
    clonesByKeeper: {
      k1: [
        {
          id: "c1",
          keeperId: "k1",
          parentCloneId: null,
          clonePlantId: "p9",
          cloneLabel: "cut #2",
          note: null,
          takenAt: "2026-07-01",
        },
      ],
    },
    crosses: [],
    reversals: [],
    reversedKeeperIds: [],
    sexByPlant: {},
    decisionsByPlant: {},
    error: null,
    saving: false,
    reload: vi.fn(),
    promoteToKeeper,
    addKeeperClone,
    markReversed,
    saveCross,
    saveStabilityRuns,
    growOutPlantsById: {
      p9: {
        plantId: "p9",
        plantName: "Gas cut #2",
        growName: null,
        traits: { nose_loudness: 9 },
      },
    },
    linkGrowOutPlant: vi.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  workspaceMock.mockReset();
  keepersMock.mockReset();
});

describe("PhenoHuntWorkspace — read-only keeps browsing live", () => {
  function renderWorkspace(patch: Partial<UsePhenoHuntWorkspaceState> = {}) {
    workspaceMock.mockImplementation(() => ({ ...workspaceState(), ...patch }));
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

  it("the herm cull queue is fenced AND its handler refuses read-only writes", () => {
    queueRemovalMock.mockClear();
    renderWorkspace({
      sexByPlant: {
        p1: {
          plantId: "p1",
          sex: "hermaphrodite",
          hermObserved: true,
          note: null,
          observedAt: "2026-03-01T00:00:00Z",
        },
      },
    });
    const queueButton = screen.getByTestId("workspace-herm-queue-p1");
    expect(queueButton).toBeDisabled(); // grid fieldset fence
    // jsdom fires synthetic clicks through disabled fieldsets, so this proves
    // the onQueueRemoval substitution — not the DOM — keeps the write out.
    fireEvent.click(queueButton);
    expect(queueRemovalMock).not.toHaveBeenCalled();
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

  it("promote's handler refuses read-only writes even on a synthetic click", () => {
    promoteToKeeper.mockClear();
    renderKeepers();
    // Form state still updates (change events bypass fieldset-disabled in
    // jsdom), making the button's OWN disabled conditions false — so the
    // click below reaches the handler, and only the canWrite guard stops it.
    fireEvent.change(screen.getByTestId("keepers-promote-plant"), { target: { value: "p1" } });
    fireEvent.change(screen.getByTestId("keepers-promote-name"), { target: { value: "Gasline" } });
    fireEvent.click(screen.getByTestId("keepers-promote-save"));
    expect(promoteToKeeper).not.toHaveBeenCalled();
  });

  it("record-a-cross is fenced AND its handler refuses read-only writes", () => {
    saveCross.mockClear();
    renderKeepers();
    // A plain k1 × k2 standard cross is submittable, so the disabled state
    // asserted here comes from the fieldset fence, not form validity.
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), { target: { value: "k2" } });
    const crossSave = screen.getByTestId("keepers-cross-save");
    expect(crossSave).toBeDisabled();
    fireEvent.click(crossSave);
    expect(saveCross).not.toHaveBeenCalled();
  });

  it("keeper-card mutations are substituted away in read-only mode", () => {
    addKeeperClone.mockClear();
    renderKeepers();
    // Fill the label so the button's OWN disabled condition is false and the
    // synthetic click reaches the handler — only the inert substitution
    // passed to KeeperCard keeps the hook mutation out.
    fireEvent.change(screen.getByTestId("keepers-clone-label-k1"), {
      target: { value: "cut #3" },
    });
    fireEvent.click(screen.getByTestId("keepers-clone-add-k1"));
    expect(addKeeperClone).not.toHaveBeenCalled();
  });

  it("the reversal arm→confirm flow never reaches markReversed in read-only mode", () => {
    markReversed.mockClear();
    renderKeepers();
    // Both clicks fire (synthetic events ignore fieldset-disabled); the
    // confirm handler runs against the inert substitution, so the permanent
    // reversal record can never be written from a read-only session.
    fireEvent.click(screen.getByTestId("keeper-reverse-k1"));
    fireEvent.click(screen.getByTestId("keeper-reverse-confirm-k1"));
    expect(markReversed).not.toHaveBeenCalled();
  });

  it("stability add-run and grow-out accept never reach saveStabilityRuns in read-only mode", () => {
    saveStabilityRuns.mockClear();
    renderKeepers();
    // Add-run path: fill the run label so the add button's own disabled
    // condition is false, then click.
    fireEvent.change(screen.getByTestId("pheno-stability-label-k1"), {
      target: { value: "Run 2" },
    });
    fireEvent.click(screen.getByTestId("pheno-stability-add-k1"));
    // Grow-out accept path: k1's linked clone with recorded traits renders
    // the handoff; accepting would APPEND a run to the ledger.
    fireEvent.click(screen.getByTestId("pheno-grow-out-accept-c1"));
    expect(saveStabilityRuns).not.toHaveBeenCalled();
  });
});

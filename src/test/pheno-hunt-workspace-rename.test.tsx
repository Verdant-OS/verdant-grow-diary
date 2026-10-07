/**
 * #551 — workspace wiring for hunt rename (Codex re-review P2s at ed586634):
 * the setup card shows the renamed value, and a pending rename survives the
 * control unmounting during a workspace reload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";

const updatePhenoHuntSetup = vi.fn();
vi.mock("@/lib/phenoHuntService", async (orig) => ({
  ...(await orig<typeof import("@/lib/phenoHuntService")>()),
  updatePhenoHuntSetup: (...args: unknown[]) => updatePhenoHuntSetup(...args),
}));
const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => hookMock(),
}));

// Active Pro entitlement so the workspace renders its writable tree — the
// page now fences every mutation control on canWriteFeatureData, and these
// tests exercise saves, not the read-only gate.
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

const queueRemoval = vi.fn().mockResolvedValue(true);
vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval,
  }),
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

function renderAt(state: Partial<UsePhenoHuntWorkspaceState>) {
  const saveScore = state.saveScore ?? vi.fn().mockResolvedValue(true);
  const saveDecision = state.saveDecision ?? vi.fn().mockResolvedValue(true);
  const saveRound = state.saveRound ?? vi.fn().mockResolvedValue(true);
  const saveSex = state.saveSex ?? vi.fn().mockResolvedValue(true);
  let currentState: UsePhenoHuntWorkspaceState = {
    status: "ok",
    hunt: { id: "h1", name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
    candidates: [],
    totalCandidateCount: state.candidates?.length ?? 0,
    loadingMore: false,
    loadMoreError: null,
    hasMore: false,
    loadNextPage: state.loadNextPage ?? vi.fn(),
    reload: state.reload ?? vi.fn(),
    filters: {},
    setFilter: state.setFilter ?? vi.fn(),
    resetFilters: state.resetFilters ?? vi.fn(),
    comparisonSummary: null,
    scoresByPlant: {},
    decisionsByPlant: {},
    roundsByKey: {},
    roundLoadStates: {
      veg: { status: "ready", error: null },
      early_flower: { status: "ready", error: null },
      mid_flower: { status: "ready", error: null },
      late_flower: { status: "ready", error: null },
      post_cure: { status: "ready", error: null },
    },
    decisionHistoryByPlant: {},
    sexByPlant: {},
    reversedPlantIds: new Set<string>(),
    clonedPlantIds: new Set<string>(),
    smokeByPlant: {},
    labByKey: {},
    error: null,
    saving: null,
    assignCandidateNumber:
      state.assignCandidateNumber ?? vi.fn().mockResolvedValue({ ok: true, candidateNumber: 1 }),
    loadDecisionHistory: state.loadDecisionHistory ?? vi.fn().mockResolvedValue(undefined),
    loadRound: state.loadRound ?? vi.fn().mockResolvedValue(undefined),
    saveScore,
    saveDecision,
    saveRound,
    saveSex,
    saveSmokeTest: state.saveSmokeTest ?? vi.fn().mockResolvedValue(true),
    saveLabResult: state.saveLabResult ?? vi.fn().mockResolvedValue(true),
    deleteLabResult: state.deleteLabResult ?? vi.fn().mockResolvedValue(true),
    ...state,
  };
  hookMock.mockImplementation(() => currentState);
  const routeTree = () => (
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>
  );
  const utils = render(routeTree());
  const rerenderState = (patch: Partial<UsePhenoHuntWorkspaceState>) => {
    currentState = { ...currentState, ...patch };
    utils.rerender(routeTree());
  };
  return { ...utils, saveScore, saveDecision, saveRound, saveSex, rerenderState };
}

beforeEach(() => {
  hookMock.mockReset();
  updatePhenoHuntSetup.mockReset();
});

function submitRename(name: string) {
  fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
  fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), { target: { value: name } });
  fireEvent.click(screen.getByTestId("pheno-hunt-rename-save"));
}

describe("PhenoHuntWorkspace rename (#551)", () => {
  it("the setup card shows the renamed value, not the old name", async () => {
    updatePhenoHuntSetup.mockResolvedValue(undefined);
    renderAt({});
    submitRename("Repaired Hunt");
    await waitFor(() => expect(screen.queryByTestId("pheno-hunt-rename-input")).toBeNull());
    const card = screen.getByTestId("pheno-workspace-setup-progress");
    expect(within(card).getByText("Repaired Hunt")).toBeDefined();
    expect(within(card).queryByText("Blue Dream Hunt")).toBeNull();
  });

  it("a pending rename keeps Rename locked across a reload remount", async () => {
    let resolve: () => void = () => {};
    updatePhenoHuntSetup.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    const { rerenderState } = renderAt({});
    submitRename("Repaired Hunt");
    await waitFor(() => expect(updatePhenoHuntSetup).toHaveBeenCalledTimes(1));
    rerenderState({ status: "loading" });
    rerenderState({ status: "ok" });
    const open = screen.getByTestId("pheno-hunt-rename-open") as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    fireEvent.click(open);
    expect(screen.queryByTestId("pheno-hunt-rename-input")).toBeNull();
    resolve();
    await waitFor(() =>
      expect((screen.getByTestId("pheno-hunt-rename-open") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Repaired Hunt");
  });
});

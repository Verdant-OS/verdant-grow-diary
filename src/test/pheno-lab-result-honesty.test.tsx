/**
 * Lab (COA) provenance honesty — regression tests for the workspace lab panel.
 *
 * Pins the fixes for the audited defects:
 *  - a NEW lab row's source defaults to "unspecified", never "coa" (a grower
 *    typing remembered numbers must not record them as lab-verified);
 *  - an estimate/unspecified row is VISIBLE in the workspace (best-available
 *    row, its own source shown) instead of only the :coa key being read;
 *  - an all-empty lab row never satisfies the lab evidence goal, and an
 *    all-empty save is refused instead of minting a row;
 *  - saves carry tested_at / note / total cannabinoids / terpene percentages
 *    instead of silently nulling them;
 *  - an existing row can be cleared (the undo for an accidental save).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { LabResultRow } from "@/lib/phenoLabResultsService";
import { labResultHasAnyValue, bestLabResultForPlant } from "@/lib/phenoLabResultsService";

const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      effectivePlanId: "pro_monthly",
      isActive: true,
      source: "subscription",
      hadProAccess: true,
    },
    refetch: () => {},
  }),
}));

vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => hookMock(),
}));

vi.mock("@/hooks/usePhenoHermCullSuggestion", () => ({
  usePhenoHermCullSuggestion: () => ({
    queuing: null,
    queuedPlantIds: new Set<string>(),
    error: null,
    queueRemoval: vi.fn().mockResolvedValue(true),
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

function labRow(partial: Partial<LabResultRow> & { plantId: string }): LabResultRow {
  return {
    source: "coa",
    thcPct: null,
    cbdPct: null,
    totalCannabinoidsPct: null,
    dominantTerpenes: [],
    testedAt: null,
    note: null,
    labVerified: partial.source ? partial.source === "coa" : true,
    ...partial,
  };
}

function renderAt(state: Partial<UsePhenoHuntWorkspaceState>) {
  const saveLabResult = state.saveLabResult ?? vi.fn().mockResolvedValue(true);
  const deleteLabResult = state.deleteLabResult ?? vi.fn().mockResolvedValue(true);
  const base: UsePhenoHuntWorkspaceState = {
    status: "ok",
    hunt: { id: "h1", name: "Lab Hunt", growId: "g1", tentId: "t1" },
    candidates: [],
    totalCandidateCount: state.candidates?.length ?? 0,
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
    assignCandidateNumber: vi.fn().mockResolvedValue({ ok: true, candidateNumber: 1 }),
    loadDecisionHistory: vi.fn().mockResolvedValue(undefined),
    loadRound: vi.fn().mockResolvedValue(undefined),
    saveScore: vi.fn().mockResolvedValue(true),
    saveDecision: vi.fn().mockResolvedValue(true),
    saveRound: vi.fn().mockResolvedValue(true),
    saveSex: vi.fn().mockResolvedValue(true),
    saveSmokeTest: vi.fn().mockResolvedValue(true),
    saveLabResult,
    deleteLabResult,
    ...state,
  };
  hookMock.mockImplementation(() => base);
  render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
  return { saveLabResult, deleteLabResult };
}

beforeEach(() => hookMock.mockReset());

const CANDIDATE = { candidateId: "p1", candidateLabel: "BD #1", stage: "cured" };

describe("lab source provenance", () => {
  it("defaults a NEW lab row's source to unspecified, never coa", () => {
    renderAt({ candidates: [CANDIDATE] });
    const select = screen.getByTestId("workspace-lab-source-p1") as HTMLSelectElement;
    expect(select.value).toBe("unspecified");
  });

  it("shows an existing estimate row (best available) instead of hiding non-coa rows", () => {
    renderAt({
      candidates: [CANDIDATE],
      labByKey: {
        "p1:estimate": labRow({
          plantId: "p1",
          source: "estimate",
          thcPct: 21.4,
          labVerified: false,
        }),
      },
    });
    const select = screen.getByTestId("workspace-lab-source-p1") as HTMLSelectElement;
    expect(select.value).toBe("estimate");
    expect((screen.getByTestId("workspace-lab-thc-p1") as HTMLInputElement).value).toBe("21.4");
  });

  it("switching source loads THAT source's stored row — no cross-contamination", () => {
    renderAt({
      candidates: [CANDIDATE],
      labByKey: {
        "p1:coa": labRow({ plantId: "p1", source: "coa", thcPct: 27.5 }),
        "p1:estimate": labRow({
          plantId: "p1",
          source: "estimate",
          thcPct: 20,
          labVerified: false,
        }),
      },
    });
    const select = screen.getByTestId("workspace-lab-source-p1") as HTMLSelectElement;
    expect(select.value).toBe("coa"); // best available
    fireEvent.change(select, { target: { value: "estimate" } });
    expect((screen.getByTestId("workspace-lab-thc-p1") as HTMLInputElement).value).toBe("20");
    fireEvent.change(select, { target: { value: "unspecified" } });
    expect((screen.getByTestId("workspace-lab-thc-p1") as HTMLInputElement).value).toBe("");
  });
});

describe("empty lab rows are not evidence", () => {
  it("labResultHasAnyValue rejects an all-empty row and accepts any real value", () => {
    const empty = labRow({ plantId: "p1" });
    expect(labResultHasAnyValue(empty)).toBe(false);
    expect(labResultHasAnyValue(labRow({ plantId: "p1", thcPct: 24 }))).toBe(true);
    expect(
      labResultHasAnyValue(
        labRow({ plantId: "p1", dominantTerpenes: [{ name: "limonene", pct: null }] }),
      ),
    ).toBe(true);
    expect(labResultHasAnyValue(null)).toBe(false);
  });

  it("bestLabResultForPlant prefers coa > estimate > unspecified", () => {
    const map = {
      "p1:estimate": labRow({ plantId: "p1", source: "estimate", labVerified: false }),
      "p1:unspecified": labRow({ plantId: "p1", source: "unspecified", labVerified: false }),
    };
    expect(bestLabResultForPlant(map, "p1")?.source).toBe("estimate");
    const withCoa = { ...map, "p1:coa": labRow({ plantId: "p1", source: "coa" }) };
    expect(bestLabResultForPlant(withCoa, "p1")?.source).toBe("coa");
    expect(bestLabResultForPlant(map, "p2")).toBeUndefined();
  });

  it("bestLabResultForPlant skips an all-empty coa row when a lower-provenance row has values", () => {
    // Legacy data: the old editor allowed empty saves and defaulted to coa.
    // An empty coa row must not shadow the populated estimate beneath it.
    const map = {
      "p1:coa": labRow({ plantId: "p1", source: "coa" }),
      "p1:estimate": labRow({ plantId: "p1", source: "estimate", thcPct: 21.5 }),
    };
    expect(bestLabResultForPlant(map, "p1")?.source).toBe("estimate");
    // When every row is empty, provenance order still decides (row identity
    // stays visible to presenters that render "recorded but empty").
    const allEmpty = {
      "p1:coa": labRow({ plantId: "p1", source: "coa" }),
      "p1:estimate": labRow({ plantId: "p1", source: "estimate", labVerified: false }),
    };
    expect(bestLabResultForPlant(allEmpty, "p1")?.source).toBe("coa");
  });

  it("an all-empty stored coa row does not tick the lab readiness goal", () => {
    // Same candidate, same stage; the only difference is whether the coa row
    // carries a value. The readiness check count must differ by exactly one.
    renderAt({
      candidates: [CANDIDATE],
      labByKey: { "p1:coa": labRow({ plantId: "p1" }) },
    });
    const emptyCount = screen.getByTestId("workspace-readiness-count-p1").textContent;
    hookMock.mockReset();
    renderAt({
      candidates: [CANDIDATE],
      labByKey: { "p1:coa": labRow({ plantId: "p1", thcPct: 24 }) },
    });
    const counts = screen.getAllByTestId("workspace-readiness-count-p1");
    const filledCount = counts[counts.length - 1].textContent;
    const parse = (t: string | null) => Number((t ?? "").split("/")[0]);
    expect(parse(filledCount)).toBe(parse(emptyCount) + 1);
  });

  it("refuses an all-empty save instead of minting a lab row", async () => {
    const { saveLabResult } = renderAt({ candidates: [CANDIDATE] });
    fireEvent.click(screen.getByTestId("workspace-save-lab-p1"));
    await waitFor(() =>
      expect(screen.getByTestId("workspace-lab-error-p1")).toHaveTextContent(/nothing to save/i),
    );
    expect(saveLabResult).not.toHaveBeenCalled();
  });
});

describe("lab saves carry the full row", () => {
  it("passes tested_at, note, total cannabinoids, and terpene percentages to the hook", async () => {
    const { saveLabResult } = renderAt({ candidates: [CANDIDATE] });
    fireEvent.change(screen.getByTestId("workspace-lab-thc-p1"), { target: { value: "24.5" } });
    fireEvent.change(screen.getByTestId("workspace-lab-total-p1"), { target: { value: "29" } });
    fireEvent.change(screen.getByTestId("workspace-lab-terps-p1"), {
      target: { value: "limonene 1.2%, pinene" },
    });
    fireEvent.change(screen.getByTestId("workspace-lab-tested-at-p1"), {
      target: { value: "2026-08-20" },
    });
    fireEvent.change(screen.getByTestId("workspace-lab-note-p1"), {
      target: { value: "Green Leaf Labs, sample 42" },
    });
    fireEvent.click(screen.getByTestId("workspace-save-lab-p1"));
    await waitFor(() => expect(saveLabResult).toHaveBeenCalledTimes(1));
    expect(saveLabResult).toHaveBeenCalledWith("p1", "unspecified", {
      thcPct: 24.5,
      cbdPct: null,
      totalCannabinoidsPct: 29,
      dominantTerpenes: [
        { name: "limonene", pct: 1.2 },
        { name: "pinene", pct: null },
      ],
      testedAt: "2026-08-20",
      note: "Green Leaf Labs, sample 42",
    });
  });

  it("offers Clear for an existing row and routes it to deleteLabResult", async () => {
    const { deleteLabResult } = renderAt({
      candidates: [CANDIDATE],
      labByKey: {
        "p1:estimate": labRow({
          plantId: "p1",
          source: "estimate",
          thcPct: 20,
          labVerified: false,
        }),
      },
    });
    const card = screen.getByTestId("pheno-workspace-candidate-p1");
    fireEvent.click(within(card).getByTestId("workspace-clear-lab-p1"));
    await waitFor(() => expect(deleteLabResult).toHaveBeenCalledWith("p1", "estimate"));
  });
});

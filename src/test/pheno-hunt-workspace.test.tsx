/**
 * PhenoHuntWorkspace — hunt workspace entry page.
 * Mocks the workspace hook and verifies loading/error/ok states, trait entry,
 * keeper-decision selection, and that Save persists via the hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";

const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => hookMock(),
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

beforeEach(() => hookMock.mockReset());

describe("PhenoHuntWorkspace", () => {
  it("shows a loading state", () => {
    renderAt({ status: "loading" });
    expect(screen.getByTestId("pheno-workspace-loading")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    renderAt({ status: "error", error: "Pheno hunt not found." });
    expect(screen.getByTestId("pheno-workspace-error")).toHaveTextContent(/not found/i);
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
  });

  it("renders candidates with loud trait inputs and a keeper-decision select", () => {
    renderAt({
      candidates: [
        { candidateId: "p1", candidateLabel: "BD #1", strain: "Blue Dream", stage: "flower" },
      ],
    });
    const card = screen.getByTestId("pheno-workspace-candidate-p1");
    expect(within(card).getByTestId("workspace-trait-p1-nose_loudness")).toBeInTheDocument();
    expect(within(card).getByTestId("workspace-trait-p1-vigor")).toBeInTheDocument();
    expect(within(card).getByTestId("workspace-decision-p1")).toBeInTheDocument();
    // suggest-only caveat present
    expect(screen.getByTestId("pheno-workspace")).toHaveTextContent(/never keeps, culls, or acts/i);
  });

  it("gives every audited candidate score, note, smoke, and lab input a contextual name", () => {
    renderAt({
      candidates: [
        { candidateId: "p1", candidateLabel: "BD #1" },
        { candidateId: "p2", candidateLabel: "BD #2" },
      ],
    });

    for (const candidateLabel of ["BD #1", "BD #2"]) {
      for (const axis of LOUD_TRAIT_AXES) {
        expect(
          screen.getByRole("spinbutton", {
            name: `${candidateLabel}: ${axis.label} score (${axis.min}–${axis.max})`,
          }),
        ).toBeInTheDocument();
      }

      expect(screen.getByRole("textbox", { name: `${candidateLabel}: Notes` })).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", {
          name: `${candidateLabel}: Post-cure smoothness score (1–5)`,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", {
          name: `${candidateLabel}: Post-cure potency impression (1–5)`,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", {
          name: `${candidateLabel}: Lab THC percentage`,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("spinbutton", {
          name: `${candidateLabel}: Lab CBD percentage`,
        }),
      ).toBeInTheDocument();
    }
  });

  it("gives controlled candidate filters stable, unique accessible names", () => {
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
    });

    expect(
      screen.getByRole("combobox", { name: "Filter candidates by keeper decision" }),
    ).toHaveAttribute("data-testid", "workspace-filter-decision");
    expect(screen.getByRole("combobox", { name: "Filter candidates by sex" })).toHaveAttribute(
      "data-testid",
      "workspace-filter-sex",
    );
    expect(
      screen.getByRole("combobox", { name: "Filter candidates by readiness" }),
    ).toHaveAttribute("data-testid", "workspace-filter-readiness");
  });

  it("saves entered trait scores and the keeper decision via the hook", async () => {
    const { saveScore, saveDecision } = renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
    });
    fireEvent.change(screen.getByTestId("workspace-trait-p1-nose_loudness"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByTestId("workspace-decision-p1"), { target: { value: "keep" } });
    fireEvent.change(screen.getByTestId("workspace-reason-p1"), {
      target: { value: "loudest of the run" },
    });
    fireEvent.click(screen.getByTestId("workspace-save-p1"));

    await waitFor(() => {
      expect(saveScore).toHaveBeenCalledWith("p1", { nose_loudness: 9 }, null);
      expect(saveDecision).toHaveBeenCalledWith("p1", "keep", "loudest of the run");
    });
    expect(await screen.findByTestId("workspace-saved-p1")).toBeInTheDocument();
  });

  it("renders the append-only decision history when present", () => {
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      decisionHistoryByPlant: {
        p1: [
          {
            plantId: "p1",
            decision: "keep",
            reason: "frostiest",
            note: null,
            decidedAt: "2026-03-02T00:00:00Z",
          },
          {
            plantId: "p1",
            decision: "hold",
            reason: "wait for cure",
            note: null,
            decidedAt: "2026-02-20T00:00:00Z",
          },
        ],
      },
    });
    const hist = screen.getByTestId("workspace-decision-history-p1");
    expect(hist).toHaveTextContent(/frostiest/);
    expect(hist).toHaveTextContent(/wait for cure/);
  });

  it("pre-fills existing saved scores and decisions", () => {
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      scoresByPlant: { p1: { plantId: "p1", traits: { vigor: 4 }, note: "stretchy" } },
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "hold", note: null, decidedAt: "2026-03-01T00:00:00Z" },
      },
    });
    expect(screen.getByTestId("workspace-trait-p1-vigor")).toHaveValue(4);
    expect(screen.getByTestId("workspace-decision-p1")).toHaveValue("hold");
  });

  it("shows an empty state when the hunt has no candidates", () => {
    renderAt({ candidates: [] });
    expect(screen.getByTestId("pheno-workspace-empty")).toBeInTheDocument();
  });

  it("surfaces a suggest-only herm removal that queues for approval on confirm", () => {
    queueRemoval.mockClear();
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
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
    const flag = screen.getByTestId("workspace-herm-flag-p1");
    expect(flag).toHaveTextContent(/consider removing/i);
    expect(flag).toHaveTextContent(/never removes a plant for you/i);
    fireEvent.click(screen.getByTestId("workspace-herm-queue-p1"));
    expect(queueRemoval).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateLabel: "BD #1",
        growId: "g1",
        plantId: "p1",
        tentId: "t1",
      }),
    );
  });

  it("suppresses the cull nudge for a REVERSED female showing pollen sacs (the herm landmine)", () => {
    // A keeper with a recorded chemical reversal is DELIBERATELY shedding
    // pollen for breeding. Recording it as "hermaphrodite" must never trigger
    // the removal alert / cull button — that would nudge culling the exact
    // plant being bred with.
    queueRemoval.mockClear();
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      sexByPlant: {
        p1: {
          plantId: "p1",
          sex: "hermaphrodite",
          hermObserved: true,
          note: null,
          observedAt: "2026-03-01T00:00:00Z",
        },
      },
      reversedPlantIds: new Set(["p1"]),
    });
    expect(screen.queryByTestId("workspace-herm-flag-p1")).toBeNull();
    expect(screen.queryByTestId("workspace-herm-queue-p1")).toBeNull();
    const reversedNote = screen.getByTestId("workspace-herm-reversed-p1");
    expect(reversedNote).toHaveTextContent(/pollen sacs expected/i);
    expect(reversedNote).toHaveTextContent(/not.*spontaneous hermaphrodite/i);
    expect(queueRemoval).not.toHaveBeenCalled();
  });

  it("a NON-reversed herm still surfaces the removal alert (landmine guard doesn't over-suppress)", () => {
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      sexByPlant: {
        p1: {
          plantId: "p1",
          sex: "hermaphrodite",
          hermObserved: true,
          note: null,
          observedAt: "2026-03-01T00:00:00Z",
        },
      },
      reversedPlantIds: new Set(), // this keeper has NO recorded reversal
    });
    expect(screen.getByTestId("workspace-herm-flag-p1")).toHaveTextContent(/consider removing/i);
    expect(screen.queryByTestId("workspace-herm-reversed-p1")).toBeNull();
  });

  it("switches to a staged round and saves via saveRound (with aroma + nose note)", async () => {
    const { saveRound, saveScore } = renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
    });
    fireEvent.change(screen.getByTestId("workspace-round-select"), {
      target: { value: "mid_flower" },
    });
    fireEvent.change(screen.getByTestId("workspace-trait-p1-nose_loudness"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByTestId("workspace-aroma-p1"), {
      target: { value: "gas, funk" },
    });
    fireEvent.change(screen.getByTestId("workspace-nose-note-p1"), {
      target: { value: "sharp fuel" },
    });
    fireEvent.click(screen.getByTestId("workspace-save-p1"));

    await waitFor(() => {
      expect(saveRound).toHaveBeenCalledWith("p1", "mid_flower", {
        loudTraits: { nose_loudness: 8 },
        aromaDescriptors: ["gas", "funk"],
        noseNote: "sharp fuel",
        note: null,
      });
    });
    // Round mode must NOT write the flat overall card.
    expect(saveScore).not.toHaveBeenCalled();
  });

  it("pre-fills an existing round card when that round is selected", () => {
    renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      roundsByKey: {
        "p1:late_flower": {
          plantId: "p1",
          round: "late_flower",
          traits: {},
          loudTraits: { vigor: 3 },
          aromaDescriptors: ["grape"],
          noseNote: "sweet",
          note: null,
          observedAt: "2026-03-01T00:00:00Z",
        },
      },
    });
    fireEvent.change(screen.getByTestId("workspace-round-select"), {
      target: { value: "late_flower" },
    });
    expect(screen.getByTestId("workspace-trait-p1-vigor")).toHaveValue(3);
    expect(screen.getByTestId("workspace-aroma-p1")).toHaveValue("grape");
  });

  it("does not mount an editable round until delayed stored values are ready", () => {
    const { rerenderState, saveScore, saveDecision, saveRound, saveSex } = renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      roundLoadStates: {
        late_flower: { status: "loading", error: null },
      },
    });

    fireEvent.change(screen.getByTestId("workspace-round-select"), {
      target: { value: "late_flower" },
    });
    expect(screen.getByTestId("workspace-round-loading")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-round-save-disabled")).toBeDisabled();
    expect(screen.queryByTestId("pheno-workspace-candidate-p1")).toBeNull();

    rerenderState({
      roundLoadStates: {
        late_flower: { status: "ready", error: null },
      },
      roundsByKey: {
        "p1:late_flower": {
          plantId: "p1",
          round: "late_flower",
          traits: {},
          loudTraits: { vigor: 4 },
          aromaDescriptors: ["grape"],
          noseNote: "sweet",
          note: "stored",
          observedAt: "2026-07-01T00:00:00Z",
        },
      },
    });

    expect(screen.getByTestId("workspace-trait-p1-vigor")).toHaveValue(4);
    expect(screen.getByTestId("workspace-aroma-p1")).toHaveValue("grape");
    expect(screen.getByTestId("workspace-nose-note-p1")).toHaveValue("sweet");
    expect(screen.getByTestId("workspace-note-p1")).toHaveValue("stored");
    expect(screen.getByTestId("workspace-save-p1")).toBeEnabled();
    expect(saveScore).not.toHaveBeenCalled();
    expect(saveDecision).not.toHaveBeenCalled();
    expect(saveRound).not.toHaveBeenCalled();
    expect(saveSex).not.toHaveBeenCalled();
  });

  it("shows a retryable round-read error with Save disabled and performs zero writes", async () => {
    const loadRound = vi.fn().mockResolvedValue(undefined);
    const { saveScore, saveDecision, saveRound, saveSex } = renderAt({
      candidates: [{ candidateId: "p1", candidateLabel: "BD #1" }],
      loadRound,
      roundLoadStates: {
        mid_flower: {
          status: "error",
          error: "Could not load this scoring round.",
        },
      },
    });

    fireEvent.change(screen.getByTestId("workspace-round-select"), {
      target: { value: "mid_flower" },
    });

    expect(screen.getByTestId("workspace-round-error")).toHaveTextContent(/could not load/i);
    expect(screen.getByTestId("workspace-round-save-disabled")).toBeDisabled();
    expect(screen.queryByTestId("pheno-workspace-candidate-p1")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-round-retry"));
    await waitFor(() => expect(loadRound).toHaveBeenCalledTimes(2));
    expect(saveScore).not.toHaveBeenCalled();
    expect(saveDecision).not.toHaveBeenCalled();
    expect(saveRound).not.toHaveBeenCalled();
    expect(saveSex).not.toHaveBeenCalled();
  });
});

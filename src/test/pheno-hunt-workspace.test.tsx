/**
 * PhenoHuntWorkspace — hunt workspace entry page.
 * Mocks the workspace hook and verifies loading/error/ok states, trait entry,
 * keeper-decision selection, and that Save persists via the hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";

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

function renderAt(state: Partial<UsePhenoHuntWorkspaceState>) {
  const saveScore = state.saveScore ?? vi.fn().mockResolvedValue(true);
  const saveDecision = state.saveDecision ?? vi.fn().mockResolvedValue(true);
  const saveRound = state.saveRound ?? vi.fn().mockResolvedValue(true);
  const saveSex = state.saveSex ?? vi.fn().mockResolvedValue(true);
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: "h1", name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
    candidates: [],
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
    saveScore,
    saveDecision,
    saveRound,
    saveSex,
    saveSmokeTest: state.saveSmokeTest ?? vi.fn().mockResolvedValue(true),
    saveLabResult: state.saveLabResult ?? vi.fn().mockResolvedValue(true),
    ...state,
  });
  const utils = render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, saveScore, saveDecision, saveRound };
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
});

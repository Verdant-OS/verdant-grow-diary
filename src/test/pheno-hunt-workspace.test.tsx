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

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";

function renderAt(state: Partial<UsePhenoHuntWorkspaceState>) {
  const saveScore = state.saveScore ?? vi.fn().mockResolvedValue(true);
  const saveDecision = state.saveDecision ?? vi.fn().mockResolvedValue(true);
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: "h1", name: "Blue Dream Hunt", growId: "g1", tentId: "t1" },
    candidates: [],
    scoresByPlant: {},
    decisionsByPlant: {},
    error: null,
    saving: null,
    saveScore,
    saveDecision,
    ...state,
  });
  const utils = render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, saveScore, saveDecision };
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
    fireEvent.click(screen.getByTestId("workspace-save-p1"));

    await waitFor(() => {
      expect(saveScore).toHaveBeenCalledWith("p1", { nose_loudness: 9 }, null);
      expect(saveDecision).toHaveBeenCalledWith("p1", "keep");
    });
    expect(await screen.findByTestId("workspace-saved-p1")).toBeInTheDocument();
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
});

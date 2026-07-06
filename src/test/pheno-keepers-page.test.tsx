/**
 * PhenoKeepersPage — keepers, clone lineage, and crosses.
 * Mocks the keepers hook and verifies the promote/clone/cross flows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoKeepersState } from "@/hooks/usePhenoKeepers";

const hookMock = vi.fn<() => UsePhenoKeepersState>();
vi.mock("@/hooks/usePhenoKeepers", () => ({
  usePhenoKeepers: () => hookMock(),
}));

import PhenoKeepersPage from "@/pages/PhenoKeepersPage";

function renderAt(state: Partial<UsePhenoKeepersState>) {
  const promoteToKeeper = state.promoteToKeeper ?? vi.fn().mockResolvedValue(true);
  const addKeeperClone = state.addKeeperClone ?? vi.fn().mockResolvedValue(true);
  const saveCross = state.saveCross ?? vi.fn().mockResolvedValue(true);
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: "h1", name: "Loud Hunt", growId: "g1", tentId: "t1" },
    candidates: [{ candidateId: "p1", candidateLabel: "GMO #1" }],
    keepers: [],
    clonesByKeeper: {},
    crosses: [],
    error: null,
    saving: false,
    promoteToKeeper,
    addKeeperClone,
    saveCross,
    ...state,
  });
  const utils = render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/keepers"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/keepers" element={<PhenoKeepersPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, promoteToKeeper, addKeeperClone, saveCross };
}

beforeEach(() => hookMock.mockReset());

describe("PhenoKeepersPage", () => {
  it("shows loading and error states", () => {
    renderAt({ status: "loading" });
    expect(screen.getByTestId("pheno-keepers-loading")).toBeInTheDocument();
    hookMock.mockReset();
    renderAt({ status: "error", error: "nope" });
    expect(screen.getByTestId("pheno-keepers-error")).toHaveTextContent("nope");
  });

  it("promotes a candidate to a named keeper", () => {
    const { promoteToKeeper } = renderAt({});
    fireEvent.change(screen.getByTestId("keepers-promote-plant"), { target: { value: "p1" } });
    fireEvent.change(screen.getByTestId("keepers-promote-name"), {
      target: { value: "Gas Keeper" },
    });
    fireEvent.click(screen.getByTestId("keepers-promote-save"));
    expect(promoteToKeeper).toHaveBeenCalledWith("p1", "Gas Keeper");
  });

  it("lists keepers with lineage and adds a clone", () => {
    const { addKeeperClone } = renderAt({
      keepers: [
        {
          id: "k1",
          huntId: "h1",
          sourcePlantId: "p1",
          keeperName: "Gas Keeper",
          note: null,
          createdAt: null,
        },
      ],
      clonesByKeeper: {
        k1: [
          {
            id: "c1",
            keeperId: "k1",
            parentCloneId: null,
            cloneLabel: "mother",
            note: null,
            takenAt: null,
          },
        ],
      },
    });
    const card = screen.getByTestId("pheno-keeper-k1");
    expect(card).toHaveTextContent(/Gas Keeper/);
    expect(card).toHaveTextContent(/GMO #1/); // source candidate label via lineage
    expect(card).toHaveTextContent(/mother/); // existing clone
    fireEvent.change(screen.getByTestId("keepers-clone-label-k1"), { target: { value: "cut #2" } });
    fireEvent.click(screen.getByTestId("keepers-clone-add-k1"));
    expect(addKeeperClone).toHaveBeenCalledWith("k1", "cut #2");
  });

  it("records a two-parent cross when two keepers exist", () => {
    const { saveCross } = renderAt({
      keepers: [
        {
          id: "k1",
          huntId: "h1",
          sourcePlantId: "p1",
          keeperName: "Gas",
          note: null,
          createdAt: null,
        },
        {
          id: "k2",
          huntId: "h1",
          sourcePlantId: "p2",
          keeperName: "Dessert Male",
          note: null,
          createdAt: null,
        },
      ],
    });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-male"), { target: { value: "k2" } });
    fireEvent.change(screen.getByTestId("keepers-cross-name"), { target: { value: "GasCake F1" } });
    fireEvent.click(screen.getByTestId("keepers-cross-save"));
    expect(saveCross).toHaveBeenCalledWith("k1", "k2", "GasCake F1");
  });

  it("renders recorded crosses", () => {
    renderAt({
      keepers: [
        {
          id: "k1",
          huntId: "h1",
          sourcePlantId: "p1",
          keeperName: "Gas",
          note: null,
          createdAt: null,
        },
        {
          id: "k2",
          huntId: "h1",
          sourcePlantId: "p2",
          keeperName: "Dessert",
          note: null,
          createdAt: null,
        },
      ],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: "k2",
          crossName: "GasCake F1",
          note: null,
          crossedAt: null,
        },
      ],
    });
    expect(
      within(screen.getByTestId("pheno-crosses")).getByTestId("pheno-cross-x1"),
    ).toHaveTextContent(/GasCake F1/);
  });
});

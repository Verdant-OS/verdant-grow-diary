/**
 * PhenoKeepersPage — keepers, clone lineage, reversals, and crosses.
 * Mocks the keepers hook and verifies promote/clone/reverse/cross flows,
 * including the B4 reproduction UI (reversal action, self/feminized/standard
 * classification preview, disabled reasons, S1 donor rendering, lineage badges).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoKeepersState } from "@/hooks/usePhenoKeepers";
import { SELF_DONOR_VALUE } from "@/lib/phenoCrossFormViewModel";

const hookMock = vi.fn<() => UsePhenoKeepersState>();
vi.mock("@/hooks/usePhenoKeepers", () => ({
  usePhenoKeepers: () => hookMock(),
}));

import PhenoKeepersPage from "@/pages/PhenoKeepersPage";

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

function renderAt(state: Partial<UsePhenoKeepersState>) {
  const promoteToKeeper = state.promoteToKeeper ?? vi.fn().mockResolvedValue(true);
  const addKeeperClone = state.addKeeperClone ?? vi.fn().mockResolvedValue(true);
  const markReversed = state.markReversed ?? vi.fn().mockResolvedValue(true);
  const saveCross = state.saveCross ?? vi.fn().mockResolvedValue(true);
  hookMock.mockReturnValue({
    status: "ok",
    hunt: { id: "h1", name: "Loud Hunt", growId: "g1", tentId: "t1" },
    candidates: [{ candidateId: "p1", candidateLabel: "GMO #1" }],
    keepers: [],
    clonesByKeeper: {},
    crosses: [],
    reversedKeeperIds: [],
    error: null,
    saving: false,
    promoteToKeeper,
    addKeeperClone,
    markReversed,
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
  return { ...utils, promoteToKeeper, addKeeperClone, markReversed, saveCross };
}

beforeEach(() => hookMock.mockReset());

describe("PhenoKeepersPage — base flows", () => {
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

  it("lists a keeper with lineage and adds a clone", () => {
    const { addKeeperClone } = renderAt({
      keepers: [keeper("k1", "Gas Keeper")],
      candidates: [{ candidateId: "k1-src", candidateLabel: "GMO #1" }],
    });
    const card = screen.getByTestId("pheno-keeper-k1");
    expect(card).toHaveTextContent(/Gas Keeper/);
    fireEvent.change(screen.getByTestId("keepers-clone-label-k1"), { target: { value: "cut #2" } });
    fireEvent.click(screen.getByTestId("keepers-clone-add-k1"));
    expect(addKeeperClone).toHaveBeenCalledWith("k1", "cut #2");
  });

  it("records a two-parent cross via the donor selector", () => {
    const { saveCross } = renderAt({
      keepers: [keeper("k1", "Gas"), keeper("k2", "Dessert Male")],
    });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), { target: { value: "k2" } });
    fireEvent.change(screen.getByTestId("keepers-cross-name"), { target: { value: "GasCake F1" } });
    // Non-reversed donor → previews F1.
    expect(screen.getByTestId("keepers-cross-preview")).toHaveTextContent(/F1/);
    fireEvent.click(screen.getByTestId("keepers-cross-save"));
    expect(saveCross).toHaveBeenCalledWith("k1", "k2", "GasCake F1");
  });
});

describe("PhenoKeepersPage — B4 reproduction UI", () => {
  it("shows a Reversed badge and hides the reverse control once reversed", () => {
    renderAt({ keepers: [keeper("k1", "Gas")], reversedKeeperIds: ["k1"] });
    expect(screen.getByTestId("keeper-reversed-badge-k1")).toBeInTheDocument();
    expect(screen.queryByTestId("keeper-reverse-k1")).toBeNull(); // append-only: no re-reverse
  });

  it("the reverse action calls the service (markReversed), not a direct write", () => {
    const { markReversed } = renderAt({ keepers: [keeper("k1", "Gas")] });
    fireEvent.change(screen.getByTestId("keeper-reverse-method-k1"), {
      target: { value: "colloidal_silver" },
    });
    fireEvent.click(screen.getByTestId("keeper-reverse-k1"));
    expect(markReversed).toHaveBeenCalledWith("k1", "colloidal_silver");
  });

  it("a reversed keeper can self (S1) with a single keeper", () => {
    const { saveCross } = renderAt({ keepers: [keeper("k1", "Gas")], reversedKeeperIds: ["k1"] });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), {
      target: { value: SELF_DONOR_VALUE },
    });
    expect(screen.getByTestId("keepers-cross-preview")).toHaveTextContent(/S1/);
    fireEvent.click(screen.getByTestId("keepers-cross-save"));
    // Selfing passes null pollen; the service records selfing_s1.
    expect(saveCross).toHaveBeenCalledWith("k1", null, "");
  });

  it("an UNREVERSED keeper cannot self — submit disabled with a reason", () => {
    renderAt({ keepers: [keeper("k1", "Gas")], reversedKeeperIds: [] });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), {
      target: { value: SELF_DONOR_VALUE },
    });
    expect((screen.getByTestId("keepers-cross-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("keepers-cross-disabled-reason")).toHaveTextContent(/revers/i);
  });

  it("a reversed donor reroutes a two-parent cross to Feminized (never forced standard)", () => {
    renderAt({
      keepers: [keeper("k1", "Gas"), keeper("k2", "Reversed Fem")],
      reversedKeeperIds: ["k2"],
    });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), { target: { value: "k2" } });
    expect(screen.getByTestId("keepers-cross-preview")).toHaveTextContent(/Feminized/);
  });

  it("explains why submit is disabled when no donor is chosen", () => {
    renderAt({ keepers: [keeper("k1", "Gas"), keeper("k2", "Other")] });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    expect(screen.getByTestId("keepers-cross-disabled-reason")).toHaveTextContent(/donor/i);
  });

  it("renders a selfing (null male) cross card as Self with an S1 badge — never blank", () => {
    renderAt({
      keepers: [keeper("k1", "Gas")],
      reversedKeeperIds: ["k1"],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: null,
          crossType: "selfing_s1",
          crossName: "Gas S1",
          note: null,
          crossedAt: null,
        },
      ],
    });
    const row = within(screen.getByTestId("pheno-crosses")).getByTestId("pheno-cross-x1");
    expect(row).toHaveTextContent(/Self/);
    expect(row).not.toHaveTextContent(/×\s*\?/); // no blank/broken donor
    expect(screen.getByTestId("pheno-cross-badge-x1")).toHaveTextContent(/S1/);
  });

  it("renders lineage badges matching each cross type", () => {
    renderAt({
      keepers: [keeper("k1", "A"), keeper("k2", "B")],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: "k2",
          crossType: "standard_f1",
          crossName: null,
          note: null,
          crossedAt: null,
        },
        {
          id: "x2",
          femaleKeeperId: "k1",
          maleKeeperId: "k2",
          crossType: "feminized_cross",
          crossName: null,
          note: null,
          crossedAt: null,
        },
      ],
    });
    expect(screen.getByTestId("pheno-cross-badge-x1")).toHaveTextContent("F1");
    expect(screen.getByTestId("pheno-cross-badge-x2")).toHaveTextContent(/Feminized/);
  });
});

describe("PhenoKeepersPage — no direct DB writes from JSX", () => {
  it("the page source contains no direct Supabase writes for crosses/reversals", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/PhenoKeepersPage.tsx"), "utf8");
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(src).not.toMatch(/pheno_crosses|pheno_reversals/);
  });
});

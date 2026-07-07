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
    reversals: [],
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

describe("PhenoKeepersPage — clone lineage tree (C4)", () => {
  it("renders clones as a nested tree with depth (mother → cut → cut-of-cut)", () => {
    renderAt({
      keepers: [keeper("k1", "Gas")],
      clonesByKeeper: {
        k1: [
          {
            id: "m",
            keeperId: "k1",
            parentCloneId: null,
            cloneLabel: "mother",
            note: null,
            takenAt: "2026-07-01",
          },
          {
            id: "c1",
            keeperId: "k1",
            parentCloneId: "m",
            cloneLabel: "cut #1",
            note: null,
            takenAt: "2026-07-02",
          },
          {
            id: "c1a",
            keeperId: "k1",
            parentCloneId: "c1",
            cloneLabel: "cut #1a",
            note: null,
            takenAt: "2026-07-03",
          },
        ],
      },
    });
    const tree = screen.getByTestId("keeper-clone-tree-k1");
    expect(within(tree).getByTestId("keeper-clone-node-m")).toHaveAttribute("data-depth", "0");
    expect(within(tree).getByTestId("keeper-clone-node-c1")).toHaveAttribute("data-depth", "1");
    expect(within(tree).getByTestId("keeper-clone-node-c1a")).toHaveAttribute("data-depth", "2");
    expect(tree).toHaveTextContent(/mother/);
    expect(tree).toHaveTextContent(/cut #1a/);
  });

  it("shows 'none yet' when a keeper has no clones", () => {
    renderAt({ keepers: [keeper("k1", "Gas")], clonesByKeeper: {} });
    expect(screen.queryByTestId("keeper-clone-tree-k1")).toBeNull();
    expect(screen.getByTestId("pheno-keeper-k1")).toHaveTextContent(/none yet/);
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

  it("clears a stale donor when the seed keeper is changed to that donor (no surprise S1)", () => {
    renderAt({ keepers: [keeper("k1", "Gas"), keeper("k2", "Other")], reversedKeeperIds: ["k2"] });
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("keepers-cross-donor"), { target: { value: "k2" } });
    // Now switch the seed to k2 — the donor was k2, which must NOT linger as a
    // self-cross. It resets, so submit is blocked asking for a donor.
    fireEvent.change(screen.getByTestId("keepers-cross-female"), { target: { value: "k2" } });
    expect((screen.getByTestId("keepers-cross-donor") as HTMLSelectElement).value).toBe("");
    expect(screen.getByTestId("keepers-cross-disabled-reason")).toHaveTextContent(/donor/i);
  });

  it("gives the per-keeper reversal control an accessible label", () => {
    renderAt({ keepers: [keeper("k1", "Gas")] });
    // Announced by an accessible name, not just visual context.
    expect(screen.getByLabelText(/Reversal method for Gas/i)).toBeInTheDocument();
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
          createdAt: null,
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
          createdAt: null,
        },
        {
          id: "x2",
          femaleKeeperId: "k1",
          maleKeeperId: "k2",
          crossType: "feminized_cross",
          crossName: null,
          note: null,
          crossedAt: null,
          createdAt: null,
        },
      ],
    });
    expect(screen.getByTestId("pheno-cross-badge-x1")).toHaveTextContent("F1");
    expect(screen.getByTestId("pheno-cross-badge-x2")).toHaveTextContent(/Feminized/);
  });
});

describe("PhenoKeepersPage — breeding activity timeline (C3)", () => {
  it("renders reversals and crosses as a chronological activity section", () => {
    renderAt({
      keepers: [keeper("k1", "Gas"), keeper("k2", "Dessert")],
      reversals: [
        {
          id: "rv1",
          keeperId: "k1",
          method: "sts",
          note: null,
          appliedAt: "2026-07-06T00:00:00Z",
          createdAt: "2026-07-06T00:00:00Z",
        },
      ],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: null,
          crossType: "selfing_s1",
          crossName: "Gas S1",
          note: null,
          crossedAt: "2026-07-07T00:00:00Z",
          createdAt: "2026-07-07T00:00:00Z",
        },
      ],
      reversedKeeperIds: ["k1"],
    });
    const activity = screen.getByTestId("pheno-keepers-activity");
    expect(activity).toHaveTextContent(/Cross recorded — Gas S1/);
    expect(activity).toHaveTextContent(/♀ Gas × Self/); // selfing renders Self
    expect(activity).toHaveTextContent(/Reversal applied — Gas/);
    // Cross (07-07) is most recent → actually rendered ABOVE the reversal (07-06).
    const text = activity.textContent ?? "";
    const crossPos = text.indexOf("Cross recorded");
    const reversalPos = text.indexOf("Reversal applied");
    expect(crossPos).toBeGreaterThanOrEqual(0);
    expect(reversalPos).toBeGreaterThanOrEqual(0);
    expect(crossPos).toBeLessThan(reversalPos);
    // Entries carry their lineage/method badges.
    expect(within(activity).getByTestId("pheno-timeline-badge-cross:x1")).toHaveTextContent(/S1/);
  });

  it("hides the activity section when there is no reversal or cross", () => {
    renderAt({ keepers: [keeper("k1", "Gas")] });
    expect(screen.queryByTestId("pheno-keepers-activity")).toBeNull();
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

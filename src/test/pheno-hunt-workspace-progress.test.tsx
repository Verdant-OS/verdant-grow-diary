/**
 * pheno-hunt-workspace-progress — readiness ladder + Evidence Packet Map in
 * the hunt workspace.
 *
 * Pins the Key rule at the UI layer:
 *   - unconfirmed setup surfaces a "Continue setup" link (persisted state);
 *   - a confirmed roster with no evidence is "Ready for tracking", NOT
 *     comparison-ready;
 *   - only recorded evidence on >= 2 candidates renders "Comparison-ready";
 *   - the map reflects the persisted goal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

const hookMock = vi.fn<() => UsePhenoHuntWorkspaceState>();
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

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";

const candidate = (id: string, label: string): PhenoCandidateInput => ({
  candidateId: id,
  candidateLabel: label,
});

function renderWorkspace(state: Partial<UsePhenoHuntWorkspaceState>) {
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
    loadDecisionHistory: vi.fn().mockResolvedValue(undefined),
    loadRound: vi.fn().mockResolvedValue(undefined),
    saveScore: vi.fn().mockResolvedValue(true),
    saveDecision: vi.fn().mockResolvedValue(true),
    saveRound: vi.fn().mockResolvedValue(true),
    saveSex: vi.fn().mockResolvedValue(true),
    saveSmokeTest: vi.fn().mockResolvedValue(true),
    saveLabResult: vi.fn().mockResolvedValue(true),
    ...state,
  });
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/workspace"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => hookMock.mockReset());

describe("workspace readiness + Evidence Packet Map", () => {
  it("unconfirmed setup shows the continue-setup link to the persisted setup step", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the keeper",
        setupConfirmedAt: null,
      },
      candidates: [candidate("p1", "#1")],
    });
    const banner = screen.getByTestId("continue-setup-banner");
    const link = within(banner).getByTestId("continue-setup-link");
    expect(link.getAttribute("href")).toBe("/pheno-hunts/h1/setup");
    expect(screen.getByTestId("hunt-readiness-stage").getAttribute("data-stage")).toBe(
      "setup_complete",
    );
  });

  it("confirmed roster with NO evidence is Ready for tracking — never comparison-ready", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the keeper",
        setupConfirmedAt: "2026-07-01T00:00:00.000Z",
      },
      candidates: [candidate("p1", "#1"), candidate("p2", "#2")],
    });
    const stage = screen.getByTestId("hunt-readiness-stage");
    expect(stage.getAttribute("data-stage")).toBe("ready_for_tracking");
    expect(stage.textContent).toMatch(/ready for tracking/i);
    expect(screen.queryByTestId("continue-setup-banner")).toBeNull();
  });

  it("keeper decisions alone never advance the stage (decisions are not evidence)", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the keeper",
        setupConfirmedAt: "2026-07-01T00:00:00.000Z",
      },
      candidates: [candidate("p1", "#1"), candidate("p2", "#2")],
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "keep", note: null, decidedAt: "2026-07-02T00:00:00.000Z" },
        p2: { plantId: "p2", decision: "cull", note: null, decidedAt: "2026-07-02T00:00:00.000Z" },
      },
    });
    // Both candidates were "decided" with zero recorded observations — the
    // hunt must NOT read as comparison-ready.
    expect(screen.getByTestId("hunt-readiness-stage").getAttribute("data-stage")).toBe(
      "ready_for_tracking",
    );
    expect(
      screen.getByTestId("evidence-packet-row-p1").getAttribute("data-has-evidence"),
    ).toBe("false");
  });

  it("evidence on one candidate only stays Ready for tracking", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the keeper",
        setupConfirmedAt: "2026-07-01T00:00:00.000Z",
      },
      candidates: [candidate("p1", "#1"), candidate("p2", "#2")],
      scoresByPlant: { p1: { plantId: "p1", traits: {}, note: null } },
    });
    expect(screen.getByTestId("hunt-readiness-stage").getAttribute("data-stage")).toBe(
      "ready_for_tracking",
    );
  });

  it("recorded evidence on two candidates renders Comparison-ready and fills the map", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the keeper",
        setupConfirmedAt: "2026-07-01T00:00:00.000Z",
      },
      candidates: [candidate("p1", "#1"), candidate("p2", "#2")],
      scoresByPlant: { p1: { plantId: "p1", traits: {}, note: null } },
      sexByPlant: {
        p2: {
          plantId: "p2",
          sex: "female",
          hermObserved: false,
          note: null,
          observedAt: "2026-07-02T00:00:00.000Z",
        },
      },
    });
    expect(screen.getByTestId("hunt-readiness-stage").getAttribute("data-stage")).toBe(
      "comparison_ready",
    );
    const map = screen.getByTestId("evidence-packet-map");
    expect(
      within(map).getByTestId("evidence-packet-row-p1").getAttribute("data-has-evidence"),
    ).toBe("true");
    expect(
      within(map).getByTestId("evidence-packet-row-p2").getAttribute("data-has-evidence"),
    ).toBe("true");
  });

  it("the map renders the persisted goal, and a legacy hunt states its absence", () => {
    renderWorkspace({
      hunt: {
        id: "h1",
        name: "Blue Dream Hunt",
        growId: "g1",
        tentId: null,
        goal: "Find the loudest gas pheno",
        setupConfirmedAt: "2026-07-01T00:00:00.000Z",
      },
      candidates: [candidate("p1", "#1")],
    });
    expect(screen.getByTestId("hunt-goal").textContent).toMatch(/Find the loudest gas pheno/);
  });

  it("legacy hunts (no goal fields on the summary) render without a false claim", () => {
    // Backfilled legacy summary: goal/setupConfirmedAt absent entirely.
    renderWorkspace({
      hunt: { id: "h1", name: "Blue Dream Hunt", growId: "g1", tentId: null },
      candidates: [candidate("p1", "#1")],
    });
    expect(screen.getByTestId("hunt-goal").textContent).toMatch(/No goal recorded/i);
    // Absent stamp reads as unconfirmed -> honest continue-setup affordance.
    expect(screen.getByTestId("continue-setup-banner")).toBeInTheDocument();
  });
});

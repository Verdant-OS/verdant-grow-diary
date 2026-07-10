/**
 * pheno-hunt-workspace-comparison-readiness — integration test that renders
 * the real PhenoHuntWorkspace surface with different onboarding + evidence
 * states and asserts the Compare candidates action is gated by
 * Comparison-ready, never by Setup complete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { UsePhenoHuntWorkspaceState } from "@/hooks/usePhenoHuntWorkspace";
import type { PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
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
vi.mock("@/hooks/usePhenoStressObservations", () => ({
  usePhenoStressObservations: () => ({
    rows: [],
    summariesByPlant: {},
    diaryOptions: [],
    save: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    loading: false,
    error: null,
  }),
}));

import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";

const HUNT_ID = "hunt-1";

function candidate(id: string): PhenoCandidateInput {
  return {
    candidateId: id,
    candidateLabel: id.toUpperCase(),
    growLabel: "Grow",
    tentLabel: "Tent",
    plantLabel: id,
    strain: "Blue Dream",
    stage: "flower",
    requireEcPh: true,
    requirePpfd: true,
    quickLogEntries: [],
    timelineEvents: [],
    photos: [],
    sensorSnapshots: [],
  };
}

interface ScenarioInput {
  hunt?: Partial<PhenoHuntSummary>;
  candidates?: PhenoCandidateInput[];
  scoresByPlant?: UsePhenoHuntWorkspaceState["scoresByPlant"];
  decisionsByPlant?: UsePhenoHuntWorkspaceState["decisionsByPlant"];
  smokeByPlant?: UsePhenoHuntWorkspaceState["smokeByPlant"];
}

function mountAt(input: ScenarioInput) {
  const hunt: PhenoHuntSummary = {
    id: HUNT_ID,
    name: "Blue Dream Hunt",
    growId: "g1",
    tentId: "t1",
    evidenceGoals: ["structure", "aroma"],
    notes: null,
    setupCompletedAt: null,
    ...(input.hunt ?? {}),
  };
  hookMock.mockReturnValue({
    status: "ok",
    hunt,
    candidates: input.candidates ?? [],
    scoresByPlant: input.scoresByPlant ?? {},
    decisionsByPlant: input.decisionsByPlant ?? {},
    roundsByKey: {},
    decisionHistoryByPlant: {},
    sexByPlant: {},
    reversedPlantIds: new Set<string>(),
    smokeByPlant: input.smokeByPlant ?? {},
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
  });
  return render(
    <MemoryRouter initialEntries={[`/pheno-hunts/${HUNT_ID}/workspace`]}>
      <LocationProbe />
      <Routes>
        <Route path="/pheno-hunts/:id/workspace" element={<PhenoHuntWorkspace />} />
        <Route
          path="/pheno-hunts/:id/compare"
          element={<div data-testid="stub-compare-page">stub compare</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="current-location" data-pathname={loc.pathname} />;
}

function currentPath(): string {
  return (
    screen.getByTestId("current-location").getAttribute("data-pathname") ?? ""
  );
}

function assertOneStatusLine(kind: "setup-status" | "comparison-status") {
  const all = screen.getAllByTestId(`pheno-workspace-setup-progress-${kind}`);
  expect(all).toHaveLength(1);
  return all[0];
}

beforeEach(() => hookMock.mockReset());

describe("PhenoHuntWorkspace — Comparison-ready gating", () => {
  afterEach(() => cleanup());

  it("setup incomplete → setup Not yet, comparison Not comparison-ready yet, disabled action", () => {
    mountAt({});
    expect(assertOneStatusLine("setup-status")).toHaveTextContent(/Setup complete:\s*Not yet/i);
    expect(assertOneStatusLine("comparison-status")).toHaveTextContent(
      /Comparison readiness:\s*Not comparison-ready yet/i,
    );
    const action = screen.getByTestId("pheno-workspace-compare-action");
    expect(action.getAttribute("data-enabled")).toBe("false");
    expect(screen.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
    expect(screen.queryByTestId("pheno-workspace-compare-action-link")).toBeNull();
  });

  it("setup complete but missing phenotype notes → Missing evidence, disabled", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      // no scores/decisions → no phenotype notes anywhere
    });
    expect(assertOneStatusLine("setup-status")).toHaveTextContent(/Setup complete:\s*Yes/i);
    const comp = assertOneStatusLine("comparison-status");
    expect(comp).toHaveTextContent(/Comparison readiness:\s*Missing evidence/i);
    const action = screen.getByTestId("pheno-workspace-compare-action");
    expect(action.getAttribute("data-readiness")).toBe("missing_evidence");
    expect(within(action).getByTestId("pheno-workspace-compare-action-reason")).toHaveTextContent(
      /Missing evidence/i,
    );
    expect(screen.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
  });

  it("phenotype notes present but no post-harvest decision → Pending until harvest", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      scoresByPlant: {
        p1: { plantId: "p1", traits: {}, note: "Frosty, fuel-forward" },
        p2: { plantId: "p2", traits: {}, note: "Piney, tight nodes" },
      },
    });
    const comp = assertOneStatusLine("comparison-status");
    expect(comp).toHaveTextContent(/Comparison readiness:\s*Pending until harvest/i);
    expect(screen.getByTestId("pheno-workspace-compare-action-reason")).toHaveTextContent(
      /Pending until harvest/i,
    );
    expect(screen.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
  });

  it("post-harvest decision recorded but no smoke test → Pending until cure", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      scoresByPlant: {
        p1: { plantId: "p1", traits: {}, note: "note 1" },
        p2: { plantId: "p2", traits: {}, note: "note 2" },
      },
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "hold", note: null, decidedAt: null },
      },
    });
    const comp = assertOneStatusLine("comparison-status");
    expect(comp).toHaveTextContent(/Comparison readiness:\s*Pending until cure/i);
    expect(screen.getByTestId("pheno-workspace-compare-action-reason")).toHaveTextContent(
      /Pending until cure/i,
    );
    expect(screen.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
  });

  it("full evidence → Comparison-ready, enabled action links to compare route", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      scoresByPlant: {
        p1: { plantId: "p1", traits: {}, note: "note 1" },
        p2: { plantId: "p2", traits: {}, note: "note 2" },
      },
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "keep", note: null, decidedAt: null },
      },
      smokeByPlant: {
        p1: {
          plantId: "p1",
          flavorDescriptors: ["gas"],
          effectDescriptors: ["couchlock"],
          smoothness: 4,
          potencyImpression: 4,
          verdict: "Solid keeper candidate for smoke",
        },
      },
    });
    expect(assertOneStatusLine("setup-status")).toHaveTextContent(/Setup complete:\s*Yes/i);
    expect(assertOneStatusLine("comparison-status")).toHaveTextContent(
      /Comparison readiness:\s*Comparison-ready/i,
    );
    const action = screen.getByTestId("pheno-workspace-compare-action");
    expect(action.getAttribute("data-enabled")).toBe("true");
    expect(action.getAttribute("data-readiness")).toBe("comparison_ready");
    const link = screen.getByTestId("pheno-workspace-compare-action-link");
    // asChild → <a href=...> is inside the Button
    const anchor = link.querySelector("a") ?? link;
    expect(anchor.getAttribute("href")).toBe(`/pheno-hunts/${HUNT_ID}/compare`);
    expect(screen.queryByTestId("pheno-workspace-compare-action-disabled")).toBeNull();
  });

  it("setup status line and comparison status line never share text", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
    });
    const setup = assertOneStatusLine("setup-status").textContent ?? "";
    const comp = assertOneStatusLine("comparison-status").textContent ?? "";
    // Setup line uses "Yes/Not yet"; comparison line uses a distinct status
    // label. They must not read as synonyms.
    expect(/comparison-ready/i.test(setup)).toBe(false);
    expect(/Setup complete:\s*Yes/i.test(comp)).toBe(false);
  });

  it("disabled Compare candidates cannot navigate to /compare on click", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
    });
    expect(currentPath()).toBe(`/pheno-hunts/${HUNT_ID}/workspace`);
    const btn = screen.getByTestId("pheno-workspace-compare-action-disabled");
    expect(btn).toBeDisabled();
    // Explicitly no anchor to /compare on the disabled surface.
    const compareAnchors = document.querySelectorAll(
      `a[href="/pheno-hunts/${HUNT_ID}/compare"]`,
    );
    expect(compareAnchors.length).toBe(0);
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.keyDown(btn, { key: " " });
    expect(currentPath()).toBe(`/pheno-hunts/${HUNT_ID}/workspace`);
    expect(screen.queryByTestId("stub-compare-page")).toBeNull();
  });

  it("disabled Compare surface still renders workspace content + missing-evidence next steps to workspace (never to /compare)", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
    });
    // Workspace content still visible (compare progress card is workspace).
    expect(
      screen.getByTestId("pheno-workspace-setup-progress-comparison-status"),
    ).toBeVisible();
    const nextSteps = screen.getAllByTestId(
      /^pheno-workspace-compare-action-next-step-/,
    );
    expect(nextSteps.length).toBeGreaterThan(0);
    for (const link of nextSteps) {
      const href = link.getAttribute("href") ?? "";
      expect(
        href.startsWith(`/pheno-hunts/${HUNT_ID}/workspace#`),
        `expected workspace anchor href, got ${href}`,
      ).toBe(true);
      expect(href.includes("/compare")).toBe(false);
      // Every anchor target must resolve to a real element in the DOM.
      const anchorId = href.split("#")[1];
      expect(document.getElementById(anchorId)).not.toBeNull();
    }
  });

  it("workspace exposes unique anchor IDs matching PHENO_WORKSPACE_ANCHORS", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
    });
    const anchors = [
      "candidate-labels",
      "phenotype-notes",
      "post-harvest-notes",
      "post-cure-notes",
      "evidence-goals",
    ];
    for (const id of anchors) {
      expect(document.querySelectorAll(`#${id}`).length).toBe(1);
    }
  });

  it("disabled Compare has aria-describedby pointing at visible helper text with reason", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
    });
    const btn = screen.getByTestId("pheno-workspace-compare-action-disabled");
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("aria-label", "Compare candidates");
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helper = document.getElementById(describedBy!);
    expect(helper).not.toBeNull();
    expect(helper).toHaveTextContent(
      /Compare candidates is disabled because this hunt is not comparison-ready yet/i,
    );
    expect(helper).toHaveTextContent(/Missing evidence/i);
    // Clicking a next-step anchor MUST NOT flip the button to enabled.
    const anySteps = screen.getAllByTestId(
      /^pheno-workspace-compare-action-next-step-/,
    );
    fireEvent.click(anySteps[0]);
    expect(
      screen.getByTestId("pheno-workspace-compare-action-disabled"),
    ).toBeDisabled();
  });

  it("enabled Compare does not render the disabled helper text", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      scoresByPlant: {
        p1: { plantId: "p1", traits: {}, note: "n1" },
        p2: { plantId: "p2", traits: {}, note: "n2" },
      },
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "keep", note: null, decidedAt: null },
      },
      smokeByPlant: {
        p1: {
          plantId: "p1",
          flavorDescriptors: ["gas"],
          effectDescriptors: ["couch"],
          smoothness: 4,
          potencyImpression: 4,
          verdict: "solid",
        },
      },
    });
    expect(screen.queryByTestId("pheno-workspace-compare-action-helper")).toBeNull();
    expect(screen.queryByTestId("pheno-workspace-compare-action-disabled-intro")).toBeNull();

  it("enabled Compare candidates renders a real <a href=/compare> and navigates on click", () => {
    mountAt({
      hunt: { setupCompletedAt: "2026-08-01T00:00:00Z" },
      candidates: [candidate("p1"), candidate("p2")],
      scoresByPlant: {
        p1: { plantId: "p1", traits: {}, note: "note 1" },
        p2: { plantId: "p2", traits: {}, note: "note 2" },
      },
      decisionsByPlant: {
        p1: { plantId: "p1", decision: "keep", note: null, decidedAt: null },
      },
      smokeByPlant: {
        p1: {
          plantId: "p1",
          flavorDescriptors: ["gas"],
          effectDescriptors: ["couchlock"],
          smoothness: 4,
          potencyImpression: 4,
          verdict: "Solid",
        },
      },
    });
    const link = screen.getByTestId("pheno-workspace-compare-action-link");
    const anchor = link.querySelector("a") ?? link;
    expect(anchor.getAttribute("href")).toBe(
      `/pheno-hunts/${HUNT_ID}/compare`,
    );
    fireEvent.click(anchor);
    expect(currentPath()).toBe(`/pheno-hunts/${HUNT_ID}/compare`);
    expect(screen.getByTestId("stub-compare-page")).toBeVisible();
  });
});

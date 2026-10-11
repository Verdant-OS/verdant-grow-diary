/**
 * CHECKLIST_GET_STARTED_FRAMING_AFTER_PLANTS_LIVE_MISS
 *
 * Live fixture (One-Tent Golden Run growId 4cad3cae-…): plantCount ≥ 1,
 * tentCount = 0, plant step already complete with “Plant memory is already
 * on this grow.” — yet production still showed the full “Get your grow
 * started” shell as primary frame after #1314.
 *
 * These pins reproduce that miss and lock the residual fix:
 *  - connected graph surfaces tentless plant memory (plantId / hasPlant)
 *  - view model stays on operating / compact Add tent
 *  - presenter refuses get-started even if shouldShowGetStartedShell drifts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import {
  buildOnboardingChecklistViewModel,
  type OnboardingChecklistViewModel,
} from "@/lib/onboardingChecklistViewModel";
import { selectConnectedOneTentGraph } from "@/lib/connectedOneTentActivationRules";
import { resetOnboardingChecklistDismiss } from "@/lib/localOnboardingPreferences";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const LIVE_GROW_ID = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const ROOT = resolve(import.meta.dirname, "../..");

beforeEach(() => {
  resetOnboardingChecklistDismiss();
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
});

describe("LIVE MISS — connected graph tentless plant memory", () => {
  it("selects plantId/hasPlant for grow-attributed plants with no tent", () => {
    const graph = selectConnectedOneTentGraph({
      grows: [{ id: LIVE_GROW_ID }],
      tents: [],
      plants: [
        { id: "plant-break", growId: LIVE_GROW_ID, tentId: null },
        { id: "plant-junk", growId: LIVE_GROW_ID, tentId: null },
      ],
      preferredGrowId: LIVE_GROW_ID,
    });

    expect(graph.growId).toBe(LIVE_GROW_ID);
    expect(graph.tentId).toBeNull();
    expect(graph.hasTent).toBe(false);
    expect(graph.hasPlant).toBe(true);
    // Lexical tie-break among tentless plants on the grow.
    expect(graph.plantId).toBe("plant-break");
  });

  it("still prefers tent-linked plants when a tent exists", () => {
    const graph = selectConnectedOneTentGraph({
      grows: [{ id: LIVE_GROW_ID }],
      tents: [{ id: "tent-a", growId: LIVE_GROW_ID }],
      plants: [
        { id: "tentless", growId: LIVE_GROW_ID, tentId: null },
        { id: "linked", growId: LIVE_GROW_ID, tentId: "tent-a" },
      ],
      preferredGrowId: LIVE_GROW_ID,
    });
    expect(graph).toMatchObject({
      tentId: "tent-a",
      plantId: "linked",
      hasPlant: true,
    });
  });
});

describe("LIVE MISS — view model + presenters (golden-run shape)", () => {
  it("forces operating frame with plantCount≥1 and tentCount=0", () => {
    const graph = selectConnectedOneTentGraph({
      grows: [{ id: LIVE_GROW_ID }],
      tents: [],
      plants: [
        { id: "plant-break", growId: LIVE_GROW_ID, tentId: null },
        { id: "plant-junk", growId: LIVE_GROW_ID, tentId: null },
      ],
      preferredGrowId: LIVE_GROW_ID,
    });

    const vm = buildOnboardingChecklistViewModel({
      growCount: 1,
      tentCount: 0,
      plantCount: 2,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
      connectedScope: graph,
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    expect(vm.steps.find((s) => s.key === "add_plant")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "add_plant")?.description).toMatch(
      /Plant memory is already on this grow/i,
    );
    expect(vm.completeCount).toBe(2);
    expect(vm.shouldShowGetStartedShell).toBe(false);
    expect(vm.primaryFrame).toBe("operating");
    expect(vm.operatingNextStep?.key).toBe("add_tent");
  });

  it("does not render Get your grow started for the live fixture", () => {
    const graph = selectConnectedOneTentGraph({
      grows: [{ id: LIVE_GROW_ID }],
      tents: [],
      plants: [
        { id: "plant-break", growId: LIVE_GROW_ID, tentId: null },
        { id: "plant-junk", growId: LIVE_GROW_ID, tentId: null },
      ],
      preferredGrowId: LIVE_GROW_ID,
    });
    const vm = buildOnboardingChecklistViewModel({
      growCount: 1,
      tentCount: 0,
      plantCount: 2,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
      connectedScope: {
        growId: graph.growId,
        tentId: graph.tentId,
        plantId: graph.plantId,
      },
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    render(
      <MemoryRouter>
        <OnboardingProgressPill vm={vm} />
        <OnboardingChecklistCard vm={vm} />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByText(/Get your grow started/i)).toBeNull();
    expect(screen.queryByText(/\d+ of \d+ complete/i)).toBeNull();
    expect(screen.getByTestId("onboarding-operating-next-step")).toBeTruthy();
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/2 of 5 steps done/i);
  });

  it("presenter refuses get-started shell when plant step is complete even if flags drift", () => {
    // Residual miss shape: plant step already complete (copy from #1308) but
    // a drifted / stale shouldShowGetStartedShell still claims get_started.
    const drifted = buildOnboardingChecklistViewModel({
      growCount: 1,
      tentCount: 0,
      plantCount: 2,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
    });
    expect(drifted.steps.find((s) => s.key === "add_plant")?.complete).toBe(true);

    const inconsistent: OnboardingChecklistViewModel = {
      ...drifted,
      shouldShowGetStartedShell: true,
      shouldShowChecklist: true,
      primaryFrame: "get_started",
      // Drift without operating next-step — presenter must still refuse shell.
      operatingNextStep: null,
    };

    render(
      <MemoryRouter>
        <OnboardingChecklistCard vm={inconsistent} />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByText(/Get your grow started/i)).toBeNull();
  });
});

describe("LIVE MISS — Dashboard wiring pins", () => {
  it("Dashboard feeds plantCount from plants.length and plantId fallback", () => {
    const dash = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
    expect(dash).toMatch(/plantCount:\s*plants\.length/);
    expect(dash).toMatch(/plantMemoryFallbackId/);
    expect(dash).toMatch(/plantId:\s*plantMemoryFallbackId/);
    // Must not pass raw activationGraph alone (loses tentless plantId on older graphs).
    expect(dash).toMatch(/connectedScope:\s*\{[\s\S]*plantId:\s*plantMemoryFallbackId/);
  });
});

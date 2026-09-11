/**
 * Render tests for the onboarding progress pill + dismissible checklist
 * card. These cover the seeded onboarding states described in the slice:
 *
 *  - new user / no grow → 0 of 5
 *  - grow only → 1 of 5
 *  - grow + tent + plant → 3 of 5
 *  - fully activated (diary and sensor) → "Grow memory active"
 *  - "Got it" hides the full checklist but the pill stays
 *  - dismiss preference persists across re-renders
 *  - localStorage failure does not crash the components
 *
 * The Dashboard page itself is too heavy to mount in unit tests (it
 * pulls in Supabase-bound hooks). We test the same view model + the two
 * presenter components the Dashboard renders. A separate static-scan
 * test (`dashboard-onboarding-pill-wiring.test.ts`) asserts the
 * Dashboard wires them in the header.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import {
  buildOnboardingChecklistViewModel,
  type OnboardingChecklistInput,
} from "@/lib/onboardingChecklistViewModel";
import { resetOnboardingChecklistDismiss } from "@/lib/localOnboardingPreferences";

const base: OnboardingChecklistInput = {
  growCount: 0,
  tentCount: 0,
  plantCount: 0,
  diaryEntryCount: 0,
  sensorReadingCount: 0,
};

function renderPair(input: OnboardingChecklistInput) {
  const vm = buildOnboardingChecklistViewModel(input);
  return render(
    <MemoryRouter>
      <OnboardingProgressPill vm={vm} />
      <OnboardingChecklistCard vm={vm} />
    </MemoryRouter>,
  );
}

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
  vi.restoreAllMocks();
});

describe("OnboardingProgressPill — seeded states", () => {
  it("new user with no grow → 0 of 5 steps done", () => {
    renderPair(base);
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill).toHaveTextContent(/0 of 5 steps done/i);
    expect(pill.getAttribute("data-activated")).toBe("false");
  });

  it("grow only → 1 of 5 steps done", () => {
    renderPair({ ...base, growCount: 1 });
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/1 of 5 steps done/i);
  });

  it("grow + tent + plant → 3 of 5 steps done", () => {
    renderPair({ ...base, growCount: 1, tentCount: 1, plantCount: 1 });
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/3 of 5 steps done/i);
  });

  it("diary entry alone leaves sensor truth incomplete", () => {
    renderPair({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
    });
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill).toHaveTextContent(/4 of 5 steps done/i);
    expect(pill.getAttribute("data-activated")).toBe("false");
    // Plant memory → operating frame; get-started shell stays hidden.
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
  });

  it("sensor reading alone leaves plant memory incomplete", () => {
    renderPair({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      sensorReadingCount: 1,
    });
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill).toHaveTextContent(/4 of 5 steps done/i);
    expect(pill.getAttribute("data-activated")).toBe("false");
  });

  it("diary entry plus sensor reading → Grow memory active", () => {
    renderPair({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
      sensorReadingCount: 1,
    });
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill).toHaveTextContent(/grow memory active/i);
    expect(pill.getAttribute("data-activated")).toBe("true");
    // Card collapses into the compact completed state, not the full list.
    expect(screen.getByTestId("onboarding-checklist-completed")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
  });
});

describe("OnboardingChecklistCard — Got it dismiss", () => {
  it("hides Add plant CTA when a persisted plant already exists under connected scope", () => {
    renderPair({
      ...base,
      growCount: 1,
      tentCount: 0,
      plantCount: 1,
      connectedScope: {
        growId: "grow-a",
        tentId: null,
        plantId: null,
      },
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    // Get-started shell must not dominate once plant memory exists.
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByText(/Get your grow started/i)).toBeNull();
    expect(screen.queryByTestId("onboarding-step-add_plant")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add plant" })).toBeNull();

    const next = screen.getByTestId("onboarding-operating-next-step");
    expect(next.getAttribute("data-next-step-key")).toBe("add_tent");
    expect(screen.getByRole("link", { name: /Add tent/i })).toBeTruthy();
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/2 of 5 steps done/i);
  });

  it("hands the exact connected Grow, Tent, and Plant to Quick Log via the step prefill", () => {
    // Plant memory suppresses the get-started shell, so the Open Quick Log CTA
    // is no longer rendered there. Prefill + href remain on the first_log step
    // for any presenter that still surfaces that step.
    const input = {
      ...base,
      growCount: 9,
      tentCount: 9,
      plantCount: 9,
      connectedScope: {
        growId: "grow / one",
        tentId: "tent-one",
        plantId: "plant-one",
      },
      firstLogEvidenceStatus: "ok" as const,
      firstLogEvidenceCount: 0,
    };
    renderPair(input);
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Quick Log" })).toBeNull();

    const vm = buildOnboardingChecklistViewModel(input);
    expect(vm.shouldShowGetStartedShell).toBe(false);
    const firstLog = vm.steps.find((s) => s.key === "first_log");
    expect(firstLog?.href).toBe("/dashboard?growId=grow%20%2F%20one");
    expect(firstLog?.quickLogPrefill).toEqual(
      expect.objectContaining({
        growId: "grow / one",
        tentId: "tent-one",
        plantId: "plant-one",
        eventType: "observation",
      }),
    );
  });

  it("renders the checklist card by default for unactivated users", () => {
    renderPair(base);
    expect(screen.getByTestId("onboarding-checklist-card")).toBeTruthy();
    expect(screen.getByTestId("onboarding-checklist-dismiss")).toBeTruthy();
  });

  it("clicking Got it hides the full checklist but leaves the pill visible", () => {
    renderPair(base);
    fireEvent.click(screen.getByTestId("onboarding-checklist-dismiss"));
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.getByTestId("onboarding-progress-pill")).toBeTruthy();
  });

  it("dismiss preference persists across a re-render (same module state)", () => {
    renderPair(base);
    fireEvent.click(screen.getByTestId("onboarding-checklist-dismiss"));
    cleanup();
    renderPair({ ...base, growCount: 1 });
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    // Pill still updates to reflect new progress.
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/1 of 5 steps done/i);
  });

  it("does not render the dismiss control for activated users", () => {
    renderPair({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
      sensorReadingCount: 1,
    });
    expect(screen.queryByTestId("onboarding-checklist-dismiss")).toBeNull();
  });

  it("localStorage failure does not crash the card", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    renderPair(base);
    expect(() => fireEvent.click(screen.getByTestId("onboarding-checklist-dismiss"))).not.toThrow();
    // Card should still render (fail open). Pill is unaffected.
    expect(screen.getByTestId("onboarding-progress-pill")).toBeTruthy();
  });
});

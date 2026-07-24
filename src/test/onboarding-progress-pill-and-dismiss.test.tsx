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
import { MemoryRouter } from "react-router-dom";

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
    expect(screen.getByTestId("onboarding-checklist-card")).toBeTruthy();
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
  it("hands the exact connected Grow, Tent, and Plant to Quick Log", () => {
    const detailSpy = vi.fn();
    const listener = (event: Event) => detailSpy((event as CustomEvent).detail);
    window.addEventListener("verdant:open-quicklog", listener);
    renderPair({
      ...base,
      growCount: 9,
      tentCount: 9,
      plantCount: 9,
      connectedScope: {
        growId: "grow / one",
        tentId: "tent-one",
        plantId: "plant-one",
      },
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    const button = screen.getByRole("button", { name: "Open Quick Log" });
    expect(button.closest("a")?.getAttribute("href")).toBe("/dashboard?growId=grow%20%2F%20one");
    fireEvent.click(button);
    expect(detailSpy).toHaveBeenCalledTimes(1);
    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        growId: "grow / one",
        tentId: "tent-one",
        plantId: "plant-one",
        eventType: "observation",
      }),
    );
    window.removeEventListener("verdant:open-quicklog", listener);
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

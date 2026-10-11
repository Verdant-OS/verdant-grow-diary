/**
 * CHECKLIST_GET_STARTED_FRAMING_AFTER_PLANTS
 *
 * When a grow already has ≥1 plant, the first-time “Get your grow started”
 * onboarding shell must not own the Dashboard primary frame. A missing tent
 * may still surface as a compact Add tent next-step — never as the 5-step
 * get-started checklist.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import {
  buildOnboardingChecklistViewModel,
  type OnboardingChecklistInput,
} from "@/lib/onboardingChecklistViewModel";
import { resetOnboardingChecklistDismiss } from "@/lib/localOnboardingPreferences";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const base: OnboardingChecklistInput = {
  growCount: 0,
  tentCount: 0,
  plantCount: 0,
  diaryEntryCount: 0,
  sensorReadingCount: 0,
};

function renderFraming(input: OnboardingChecklistInput) {
  const vm = buildOnboardingChecklistViewModel(input);
  return {
    vm,
    ...render(
      <MemoryRouter>
        <OnboardingProgressPill vm={vm} />
        <OnboardingChecklistCard vm={vm} />
      </MemoryRouter>,
    ),
  };
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
});

describe("get-started framing after plants — view model", () => {
  it("suppresses get-started shell when plants exist and tent is missing", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 0,
      plantCount: 2,
      connectedScope: {
        growId: "grow-a",
        tentId: null,
        plantId: null,
      },
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    expect(vm.steps.find((s) => s.key === "add_plant")?.complete).toBe(true);
    expect(vm.steps.find((s) => s.key === "add_tent")?.complete).toBe(false);
    expect(vm.isFullyActivated).toBe(false);
    expect(vm.shouldShowGetStartedShell).toBe(false);
    expect(vm.shouldShowChecklist).toBe(false);
    expect(vm.primaryFrame).toBe("operating");
    expect(vm.operatingNextStep).toEqual(
      expect.objectContaining({
        key: "add_tent",
        ctaLabel: "Add tent",
      }),
    );
    expect(vm.operatingNextStep?.href).toMatch(/\/tents/);
  });

  it("keeps get-started shell when grow exists but no plants yet", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 0,
      plantCount: 0,
    });
    expect(vm.shouldShowGetStartedShell).toBe(true);
    expect(vm.shouldShowChecklist).toBe(true);
    expect(vm.primaryFrame).toBe("get_started");
    expect(vm.operatingNextStep).toBeNull();
  });

  it("uses operating frame when plants exist even if log/sensor steps remain", () => {
    const vm = buildOnboardingChecklistViewModel({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
    });
    expect(vm.shouldShowGetStartedShell).toBe(false);
    expect(vm.primaryFrame).toBe("operating");
    expect(vm.operatingNextStep).toBeNull();
  });
});

describe("get-started framing after plants — presenters", () => {
  it("does not render Get your grow started when plants exist and tent is missing", () => {
    renderFraming({
      ...base,
      growCount: 1,
      tentCount: 0,
      plantCount: 2,
      connectedScope: {
        growId: "grow-a",
        tentId: null,
        plantId: null,
      },
      firstLogEvidenceStatus: "ok",
      firstLogEvidenceCount: 0,
    });

    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByText(/Get your grow started/i)).toBeNull();
    expect(screen.queryByText(/\d+ of \d+ complete/i)).toBeNull();

    const next = screen.getByTestId("onboarding-operating-next-step");
    expect(next).toHaveTextContent(/Add tent/i);
    expect(next).not.toHaveTextContent(/Get your grow started/i);
    expect(screen.getByRole("link", { name: /Add tent/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/tents/),
    );
  });

  it("still shows get-started shell before any plant exists", () => {
    renderFraming({ ...base, growCount: 1, tentCount: 0, plantCount: 0 });
    expect(screen.getByTestId("onboarding-checklist-card")).toBeTruthy();
    expect(screen.getByText(/Get your grow started/i)).toBeTruthy();
    expect(screen.queryByTestId("onboarding-operating-next-step")).toBeNull();
  });

  it("hides get-started shell when plants + tent exist but activation is incomplete", () => {
    renderFraming({
      ...base,
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
    });
    expect(screen.queryByTestId("onboarding-checklist-card")).toBeNull();
    expect(screen.queryByText(/Get your grow started/i)).toBeNull();
    expect(screen.queryByTestId("onboarding-operating-next-step")).toBeNull();
    expect(screen.getByTestId("onboarding-progress-pill")).toHaveTextContent(/3 of 5 steps done/i);
  });
});

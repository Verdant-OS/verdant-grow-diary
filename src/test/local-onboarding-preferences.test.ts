/**
 * Tests for the local-only onboarding dismiss preference helper.
 *
 * Verifies:
 *  - default state is "not dismissed"
 *  - dismiss flips persisted value
 *  - reset clears the value
 *  - localStorage failures fail open (no throw, treated as visible)
 *  - the storage key matches the documented scoped key
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ONBOARDING_CHECKLIST_DISMISSED_KEY,
  dismissOnboardingChecklist,
  isOnboardingChecklistDismissed,
  resetOnboardingChecklistDismiss,
} from "@/lib/localOnboardingPreferences";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localOnboardingPreferences", () => {
  it("uses the documented scoped storage key", () => {
    expect(ONBOARDING_CHECKLIST_DISMISSED_KEY).toBe(
      "verdant:onboarding-checklist-dismissed:v1",
    );
  });

  it("defaults to not dismissed", () => {
    expect(isOnboardingChecklistDismissed()).toBe(false);
  });

  it("dismiss persists across reads", () => {
    dismissOnboardingChecklist();
    expect(isOnboardingChecklistDismissed()).toBe(true);
    expect(
      window.localStorage.getItem(ONBOARDING_CHECKLIST_DISMISSED_KEY),
    ).toBe("1");
  });

  it("reset clears the preference", () => {
    dismissOnboardingChecklist();
    resetOnboardingChecklistDismiss();
    expect(isOnboardingChecklistDismissed()).toBe(false);
  });

  it("fails open when getItem throws (treats as visible)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    expect(() => isOnboardingChecklistDismissed()).not.toThrow();
    expect(isOnboardingChecklistDismissed()).toBe(false);
    spy.mockRestore();
  });

  it("fails open when setItem throws (does not crash dismiss)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => dismissOnboardingChecklist()).not.toThrow();
    spy.mockRestore();
  });
});

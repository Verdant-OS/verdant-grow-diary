import { describe, expect, it } from "vitest";
import {
  LANDING_ONBOARDING_BRIDGE_LOADING_LABEL,
  isOnboardingBridgeCountReady,
} from "@/lib/onboardingBridgeReadinessRules";

describe("onboardingBridgeReadinessRules", () => {
  it("pins the loading placeholder copy shown while counts are held", () => {
    expect(LANDING_ONBOARDING_BRIDGE_LOADING_LABEL).toBe("Checking your setup…");
  });

  it("requires every reported loading flag to be false before showing the count", () => {
    const settled = { growsLoading: false, tentsLoading: false, plantsLoading: false };
    expect(isOnboardingBridgeCountReady(settled)).toBe(true);
    expect(isOnboardingBridgeCountReady({ ...settled, growsLoading: true })).toBe(false);
    expect(isOnboardingBridgeCountReady({ ...settled, tentsLoading: true })).toBe(false);
    expect(isOnboardingBridgeCountReady({ ...settled, plantsLoading: true })).toBe(false);
  });

  it("treats missing loading flags as settled so legacy callers stay unchanged", () => {
    expect(
      isOnboardingBridgeCountReady({
        growsLoading: undefined,
        tentsLoading: undefined,
        plantsLoading: undefined,
      }),
    ).toBe(true);
  });
});

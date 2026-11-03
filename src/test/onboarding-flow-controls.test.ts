import { beforeEach, describe, expect, it } from "vitest";
import { OnboardingFlowControls } from "@/lib/onboardingFlowControls";

const USER = "44444444-4444-4444-8444-444444444444";

describe("OnboardingFlowControls", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows Back only after the first step, and not once a room row exists", () => {
    expect(OnboardingFlowControls.showsBack("start-screen")).toBe(false);
    expect(OnboardingFlowControls.showsBack("start-room")).toBe(true);
    expect(OnboardingFlowControls.showsBack("start-room", true)).toBe(false);
    expect(OnboardingFlowControls.backHref()).toBe("/onboarding");
    expect(OnboardingFlowControls.restartHref()).toBe("/onboarding");
  });

  it("disables Restart while a create is busy or its outcome is unknown, and once a row exists", () => {
    const open = { savedRoom: false, busy: false, createOutcomeUnknown: false };
    expect(OnboardingFlowControls.restartEnabled(open)).toBe(true);
    expect(OnboardingFlowControls.restartEnabled({ ...open, busy: true })).toBe(false);
    expect(OnboardingFlowControls.restartEnabled({ ...open, createOutcomeUnknown: true })).toBe(
      false,
    );
    expect(
      OnboardingFlowControls.savedRoom({
        growId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(true);
    expect(OnboardingFlowControls.restartEnabled({ ...open, savedRoom: true })).toBe(false);
  });

  it("pins the mobile primary width offset and desktop centering", () => {
    expect(OnboardingFlowControls.mobilePrimaryButtonWidthClass).toBe(
      "w-[calc(100%-4.5rem)] md:w-full",
    );
    expect(OnboardingFlowControls.mobilePrimaryClearanceClass).toContain("md:justify-center");
    expect(OnboardingFlowControls.mobilePrimaryClearanceClass).toContain("min-h-[100dvh]");
  });

  it("keeps the start-screen answer until Restart clears both drafts", () => {
    OnboardingFlowControls.rememberStartScreenChoice(USER, "timeline");
    window.sessionStorage.setItem(
      `verdant.session-form.1.${USER}.start-your-room`,
      JSON.stringify({ plantName: "Kept Plant" }),
    );
    expect(OnboardingFlowControls.readStartScreenChoice(USER)).toBe("timeline");
    OnboardingFlowControls.clearFlowAnswers(USER);
    expect(OnboardingFlowControls.readStartScreenChoice(USER)).toBe("quickLog");
    expect(
      window.sessionStorage.getItem(`verdant.session-form.1.${USER}.start-your-room`),
    ).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { OnboardingFlowControls } from "@/lib/onboardingFlowControls";

const USER = "44444444-4444-4444-8444-444444444444";

describe("OnboardingFlowControls", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows Back only after the first step", () => {
    expect(OnboardingFlowControls.showsBack("start-screen")).toBe(false);
    expect(OnboardingFlowControls.showsBack("start-room")).toBe(true);
    expect(OnboardingFlowControls.backHref()).toBe("/onboarding");
    expect(OnboardingFlowControls.restartHref()).toBe("/onboarding");
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

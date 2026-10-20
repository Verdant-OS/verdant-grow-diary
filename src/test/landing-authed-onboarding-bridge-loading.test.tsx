/**
 * QA 2026-10-20 bug 8: the Dashboard pill read "3 of 5 steps done" while
 * /welcome read "0 of 5". The /welcome bridge rendered its count before the
 * grows, tents and plants it counts had loaded, so every count was zero.
 * The bridge now holds the count until those reads settle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const growsMock = vi.fn();
const tentsMock = vi.fn();
const plantsMock = vi.fn();

vi.mock("@/store/grows", () => ({ useGrows: () => growsMock() }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => tentsMock(),
  useGrowPlants: () => plantsMock(),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: "idle",
    summary: { count: 0, hasEvidence: false, latestAt: null, latestSource: null },
  }),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";
import {
  LANDING_ONBOARDING_BRIDGE_LOADING_LABEL,
  isOnboardingBridgeCountReady,
} from "@/lib/onboardingBridgeReadinessRules";

const GROW = { id: "g1", name: "Grow" };
const TENT = { id: "t1", growId: "g1", name: "Tent" };
const PLANT = { id: "p1", growId: "g1", tentId: "t1", name: "Plant" };

function renderBridge() {
  return render(
    <MemoryRouter>
      <LandingAuthedOnboardingBridge />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  growsMock.mockReturnValue({ grows: [GROW], activeGrowId: "g1", loading: false });
  tentsMock.mockReturnValue({ data: [TENT], isLoading: false });
  plantsMock.mockReturnValue({ data: [PLANT], isLoading: false });
});

describe("/welcome onboarding bridge waits for its data (QA 2026-10-20 bug 8)", () => {
  it("shows no step count while grows are still loading", () => {
    growsMock.mockReturnValue({ grows: [], activeGrowId: null, loading: true });
    renderBridge();
    expect(screen.queryByTestId("onboarding-progress-pill")).toBeNull();
    expect(screen.queryByText(/of \d+ steps done/)).toBeNull();
    expect(screen.getByTestId("landing-authed-onboarding-bridge-loading").textContent).toBe(
      LANDING_ONBOARDING_BRIDGE_LOADING_LABEL,
    );
  });

  it("shows no step count while tents or plants are still loading", () => {
    tentsMock.mockReturnValue({ data: undefined, isLoading: true });
    renderBridge();
    expect(screen.queryByTestId("onboarding-progress-pill")).toBeNull();
    plantsMock.mockReturnValue({ data: undefined, isLoading: true });
    tentsMock.mockReturnValue({ data: [TENT], isLoading: false });
    renderBridge();
    expect(screen.queryByTestId("onboarding-progress-pill")).toBeNull();
  });

  it("shows the real count once every read has settled", () => {
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).not.toBe("0");
    expect(screen.queryByTestId("landing-authed-onboarding-bridge-loading")).toBeNull();
  });

  it("keeps the Dashboard CTA available while loading", () => {
    growsMock.mockReturnValue({ grows: [], activeGrowId: null, loading: true });
    renderBridge();
    expect(screen.getByTestId("landing-authed-onboarding-bridge-cta")).toBeTruthy();
  });
});

describe("isOnboardingBridgeCountReady", () => {
  it("is ready only when grows, tents and plants have all settled", () => {
    const settled = { growsLoading: false, tentsLoading: false, plantsLoading: false };
    expect(isOnboardingBridgeCountReady(settled)).toBe(true);
    expect(isOnboardingBridgeCountReady({ ...settled, growsLoading: true })).toBe(false);
    expect(isOnboardingBridgeCountReady({ ...settled, tentsLoading: true })).toBe(false);
    expect(isOnboardingBridgeCountReady({ ...settled, plantsLoading: true })).toBe(false);
  });

  it("treats an unreported loading flag as settled", () => {
    expect(
      isOnboardingBridgeCountReady({
        growsLoading: undefined,
        tentsLoading: undefined,
        plantsLoading: undefined,
      }),
    ).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";
const PLANT = "33333333-3333-4333-8333-333333333333";

const reads = vi.hoisted(() => ({
  grows: [] as { id: string }[],
  tents: [] as { id: string; growId: string }[],
  plants: [] as { id: string; growId: string; tentId: string }[],
  activeGrowId: "",
  sensorPending: false,
  sensorLoading: false,
  evidenceStatus: "ok" as "idle" | "loading" | "ok" | "unavailable",
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: reads.grows, activeGrowId: reads.activeGrowId, loading: false }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: reads.tents, isLoading: false }),
  useGrowPlants: () => ({ data: reads.plants, isLoading: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isPending: reads.sensorPending,
    isLoading: reads.sensorLoading,
  }),
}));
vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: reads.evidenceStatus,
    summary: { count: 0, hasEvidence: false, latestAt: null, latestSource: null },
  }),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";

function bridge() {
  return (
    <MemoryRouter>
      <LandingAuthedOnboardingBridge />
    </MemoryRouter>
  );
}

function expectPendingCount() {
  expect(screen.queryByTestId("onboarding-progress-pill")).not.toBeInTheDocument();
  expect(screen.getByTestId("landing-authed-onboarding-bridge-loading")).toHaveTextContent(
    "Checking your setup…",
  );
}

function expectConnectedCount() {
  const pill = screen.getByTestId("onboarding-progress-pill");
  expect(pill).toHaveAttribute("data-complete-count", "3");
  expect(pill).toHaveAttribute("data-total-count", "5");
  expect(pill).toHaveTextContent("3 of 5 steps done");
  expect(screen.queryByTestId("landing-authed-onboarding-bridge-loading")).not.toBeInTheDocument();
}

beforeEach(() => {
  reads.grows = [{ id: GROW }];
  reads.tents = [{ id: TENT, growId: GROW }];
  reads.plants = [{ id: PLANT, growId: GROW, tentId: TENT }];
  reads.activeGrowId = GROW;
  reads.sensorPending = false;
  reads.sensorLoading = false;
  reads.evidenceStatus = "ok";
});

afterEach(cleanup);

describe("welcome progress waits for the evidence reads it counts", () => {
  it.each([
    { sensorPending: true, sensorLoading: false, state: "paused initial read" },
    { sensorPending: true, sensorLoading: true, state: "fetching initial read" },
  ])("withholds a count during a $state", ({ sensorPending, sensorLoading }) => {
    reads.sensorPending = sensorPending;
    reads.sensorLoading = sensorLoading;
    render(bridge());
    expectPendingCount();
  });

  it("withholds a count while activation evidence is unresolved", () => {
    reads.evidenceStatus = "loading";
    render(bridge());
    expectPendingCount();
  });

  it("waits for both reads, then renders exactly the connected graph's three steps", () => {
    reads.sensorPending = true;
    reads.evidenceStatus = "loading";
    const view = render(bridge());
    expectPendingCount();

    reads.sensorPending = false;
    view.rerender(bridge());
    expectPendingCount();

    reads.evidenceStatus = "ok";
    view.rerender(bridge());
    expectConnectedCount();
  });

  it("renders the exact settled count when neither evidence source has a saved row", () => {
    render(bridge());
    expectConnectedCount();
  });

  it("does not wait on a disabled sensor query when no tent exists", () => {
    reads.tents = [];
    reads.plants = [];
    reads.sensorPending = true;
    reads.evidenceStatus = "idle";
    render(bridge());
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill).toHaveAttribute("data-complete-count", "1");
    expect(pill).toHaveTextContent("1 of 5 steps done");
  });
});

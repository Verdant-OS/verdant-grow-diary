/**
 * PlantBlueprintOverlaySection while the server check runs. With
 * entitlements settled but the server verdict pending, the section renders
 * nothing: no paywall flash for a Craft grower, no overlay before the server
 * allows. plant-blueprint-overlay-section.test.tsx (a locked scorer) covers
 * the settled states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const entitlementsMock = vi.fn();
const snapshotMock = vi.fn();
const rootZoneMock = vi.fn();
const serverAccessMock = vi.fn();

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => entitlementsMock(),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: (...args: unknown[]) => snapshotMock(...args),
}));
vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: (...args: unknown[]) => rootZoneMock(...args),
}));
vi.mock("@/hooks/useBlueprintServerAccess", () => ({
  useBlueprintServerAccess: (enabled: boolean, planKey: string) =>
    serverAccessMock(enabled, planKey),
}));

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/funnelAnalytics")>();
  return { ...real, trackFunnelEvent: trackSpy };
});

import { PlantBlueprintOverlaySection } from "@/components/PlantBlueprintOverlaySection";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

function entitlement(blueprint: boolean, extra: Record<string, unknown> = {}) {
  return {
    entitlement: {
      isActive: true,
      effectivePlanId: blueprint ? "craft_annual" : "pro_monthly",
      capabilities: { blueprint },
    },
    loading: false,
    lookupFailed: false,
    ...extra,
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <PlantBlueprintOverlaySection growId="g1" tentId="t1" plantId="p1" stage="veg" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  snapshotMock.mockReset().mockReturnValue({ status: "ok", snapshot: EMPTY_SNAPSHOT });
  rootZoneMock.mockReset().mockReturnValue({ observations: [] });
  serverAccessMock.mockReset();
  trackSpy.mockClear();
});

describe("PlantBlueprintOverlaySection — server verdict pending", () => {
  it("renders nothing for a Craft grower while the server check runs", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    serverAccessMock.mockReturnValue({ allowed: false, pending: true });
    const { container } = renderSection();
    expect(screen.queryByTestId("pro-blueprint-paywall")).toBeNull();
    expect(screen.queryByTestId("pro-blueprint-locked")).toBeNull();
    expect(screen.queryByTestId("pro-blueprint-overlay")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("loads no readings while the server check runs", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    serverAccessMock.mockReturnValue({ allowed: false, pending: true });
    renderSection();
    expect(snapshotMock).toHaveBeenLastCalledWith(null, []);
    expect(rootZoneMock).toHaveBeenLastCalledWith(null);
  });

  it("shows the overlay and loads readings once the server allows", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    serverAccessMock.mockReturnValue({ allowed: false, pending: true });
    const { rerender } = renderSection();
    serverAccessMock.mockReturnValue({ allowed: true, pending: false });
    rerender(
      <MemoryRouter>
        <PlantBlueprintOverlaySection growId="g1" tentId="t1" plantId="p1" stage="veg" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("pro-blueprint-overlay")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-paywall")).toBeNull();
    expect(snapshotMock).toHaveBeenLastCalledWith("g1", ["t1"]);
    expect(rootZoneMock).toHaveBeenLastCalledWith({ kind: "plant", plantId: "p1" });
  });
});

describe("PlantBlueprintOverlaySection — what it asks the server", () => {
  it("asks for a verdict with the plan key when the client sees Craft", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    serverAccessMock.mockReturnValue({ allowed: true, pending: false });
    renderSection();
    expect(serverAccessMock).toHaveBeenCalledWith(true, "craft_annual");
  });

  it.each([
    ["the client sees no Blueprint plan", entitlement(false)],
    ["the entitlement lookup failed", entitlement(true, { lookupFailed: true })],
  ])("does not enable the server check when %s", (_label, ent) => {
    entitlementsMock.mockReturnValue(ent);
    serverAccessMock.mockReturnValue({ allowed: false, pending: false });
    renderSection();
    expect(serverAccessMock).toHaveBeenCalled();
    for (const [enabled] of serverAccessMock.mock.calls) expect(enabled).toBe(false);
    expect(screen.getByTestId("pro-blueprint-locked")).toBeTruthy();
  });

  it("uses the 'none' plan key when there is no entitlement", () => {
    entitlementsMock.mockReturnValue({ entitlement: null, loading: false, lookupFailed: false });
    serverAccessMock.mockReturnValue({ allowed: false, pending: false });
    renderSection();
    expect(serverAccessMock).toHaveBeenCalledWith(false, "none");
  });
});

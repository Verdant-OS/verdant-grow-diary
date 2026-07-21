/**
 * Tests for PlantBlueprintOverlaySection — the gate/container: Pro growers see
 * the overlay (scored against live + logged inputs), others see the paywall,
 * and it renders nothing while loading.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const entitlementsMock = vi.fn();
const snapshotMock = vi.fn();
const rootZoneMock = vi.fn();

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => entitlementsMock(),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => snapshotMock(),
}));
vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: () => rootZoneMock(),
}));

import { PlantBlueprintOverlaySection } from "@/components/PlantBlueprintOverlaySection";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

function entitlement(blueprint: boolean, extra: Record<string, unknown> = {}) {
  return {
    // Blueprint is Craft-exclusive: the gate checks the `blueprint` capability.
    entitlement: { isActive: true, capabilities: { blueprint } },
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
  snapshotMock.mockReturnValue({ status: "ok", snapshot: EMPTY_SNAPSHOT });
  rootZoneMock.mockReturnValue({ observations: [] });
});

describe("PlantBlueprintOverlaySection", () => {
  it("renders the overlay for a Craft grower (blueprint capability)", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-overlay")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-paywall")).toBeNull();
  });

  it("scores the root-zone rows from the latest logged EC/pH", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    // veg EC band 1.0-1.8, pH band 5.8-5.9 → both in band (green)
    rootZoneMock.mockReturnValue({
      observations: [{ metrics: { inputEcMsCm: 1.4, inputPh: 5.85 } }],
    });
    renderSection();
    const ecRow = screen.getByTestId("pro-blueprint-overlay-row-ec");
    expect(ecRow.getAttribute("data-tone")).toBe("green");
    expect(screen.getByTestId("pro-blueprint-overlay-value-ec").textContent).toContain("1.4");
    expect(screen.getByTestId("pro-blueprint-overlay-row-ph").getAttribute("data-tone")).toBe(
      "green",
    );
  });

  it("renders the paywall for a grower without the capability", () => {
    entitlementsMock.mockReturnValue(entitlement(false));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-paywall")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-overlay")).toBeNull();
  });

  it("renders the paywall when the entitlement lookup failed (fail closed)", () => {
    entitlementsMock.mockReturnValue(entitlement(true, { lookupFailed: true }));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-paywall")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-overlay")).toBeNull();
  });

  it("renders nothing while entitlements are loading", () => {
    entitlementsMock.mockReturnValue(entitlement(true, { loading: true }));
    const { container } = renderSection();
    expect(screen.queryByTestId("pro-blueprint-overlay")).toBeNull();
    expect(screen.queryByTestId("pro-blueprint-paywall")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

/**
 * Tests for PlantBlueprintOverlaySection — the gate/container: Pro growers see
 * the overlay, others see the paywall, and it renders nothing while loading.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const entitlementsMock = vi.fn();
const snapshotMock = vi.fn();

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => entitlementsMock(),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => snapshotMock(),
}));

import { PlantBlueprintOverlaySection } from "@/components/PlantBlueprintOverlaySection";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

function entitlement(liveSensors: boolean, extra: Record<string, unknown> = {}) {
  return {
    entitlement: { isActive: true, capabilities: { liveSensors } },
    loading: false,
    lookupFailed: false,
    ...extra,
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <PlantBlueprintOverlaySection growId="g1" tentId="t1" stage="veg" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  snapshotMock.mockReturnValue({ status: "ok", snapshot: EMPTY_SNAPSHOT });
});

describe("PlantBlueprintOverlaySection", () => {
  it("renders the overlay for a Pro grower (liveSensors capability)", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-overlay")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-paywall")).toBeNull();
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

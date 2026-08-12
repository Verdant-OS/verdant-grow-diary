/**
 * Tests for PlantBlueprintOverlaySection — the gate/container: Pro growers see
 * the overlay (scored against live + logged inputs), others see the paywall,
 * and it renders nothing while loading.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

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

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/funnelAnalytics")>();
  return { ...real, trackFunnelEvent: trackSpy };
});

import { PlantBlueprintOverlaySection } from "@/components/PlantBlueprintOverlaySection";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

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
  clearTemperatureUnitPreference();
  snapshotMock.mockReturnValue({ status: "ok", snapshot: EMPTY_SNAPSHOT });
  rootZoneMock.mockReturnValue({ observations: [] });
  trackSpy.mockClear();
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

  it("previews the stage's SOP target bands (conversion demo) above the paywall, in the default Fahrenheit unit", () => {
    // Locked grower on a veg plant sees the real per-stage targets Craft scores
    // against — the paid value made concrete — with the paywall CTA beneath it.
    entitlementsMock.mockReturnValue(entitlement(false));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-locked")).toBeTruthy();
    expect(screen.getByTestId("pro-blueprint-teaser")).toBeTruthy();
    // veg temperature target, straight from the SOP band table.
    expect(screen.getByTestId("pro-blueprint-teaser-row-tempC").textContent).toMatch(/°F/);
    // The teaser never fetches or shows the grower's own readings (static bands).
    expect(screen.queryByTestId("pro-blueprint-overlay")).toBeNull();
  });

  it("previews the teaser's temperature band in Celsius when the preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    entitlementsMock.mockReturnValue(entitlement(false));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-teaser-row-tempC").textContent).toMatch(/°C/);
    expect(screen.getByTestId("pro-blueprint-teaser-row-tempC").textContent).not.toMatch(/°F/);
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

describe("paywall impression (surface: blueprint_locked)", () => {
  // Entry clicks are counted (blueprint_cta_clicked, #929); this impression is
  // the denominator: how many verified non-Craft growers actually see the
  // teaser + paywall after arriving.

  it("fires once, id-free, for a settled verified viewer without the capability", () => {
    entitlementsMock.mockReturnValue(entitlement(false));
    renderSection();
    expect(trackSpy).toHaveBeenCalledTimes(1);
    expect(trackSpy).toHaveBeenCalledWith("paywall_viewed", { surface: "blueprint_locked" });
    // No plant/grow/tent ids in the payload.
    expect(JSON.stringify(trackSpy.mock.calls[0])).not.toMatch(/p1|g1|t1/);
  });

  it("dedupes across an entitlement flicker — one mount, one impression", () => {
    // A refetch can flip the gate locked -> loading -> locked within one
    // mount, re-running the effect (its dep changed twice). Without the ref
    // that would double-count the same viewer on the same page view.
    entitlementsMock.mockReturnValue(entitlement(false));
    const { rerender } = renderSection();
    // Fresh JSX per rerender — a reused element reference makes React bail
    // out of re-rendering the subtree entirely, and the flicker never happens.
    entitlementsMock.mockReturnValue(entitlement(false, { loading: true }));
    rerender(
      <MemoryRouter>
        <PlantBlueprintOverlaySection growId="g1" tentId="t1" plantId="p1" stage="veg" />
      </MemoryRouter>,
    );
    entitlementsMock.mockReturnValue(entitlement(false));
    rerender(
      <MemoryRouter>
        <PlantBlueprintOverlaySection growId="g1" tentId="t1" plantId="p1" stage="veg" />
      </MemoryRouter>,
    );
    expect(trackSpy).toHaveBeenCalledTimes(1);
  });

  it("never fires while entitlements are loading", () => {
    entitlementsMock.mockReturnValue(entitlement(false, { loading: true }));
    renderSection();
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it("never fires on an unverified entitlement, even though the paywall renders", () => {
    // STRICTER than the render on purpose: on lookupFailed the section still
    // shows the (safe) teaser + CTA, but the viewer may well be Craft with a
    // failed plan read — counting them would inflate the upgrade funnel.
    // The capability-ABSENT case is the trap: it looks exactly like a real
    // impression, and only the lookupFailed guard keeps it out.
    entitlementsMock.mockReturnValue(entitlement(false, { lookupFailed: true }));
    renderSection();
    expect(screen.getByTestId("pro-blueprint-paywall")).toBeTruthy();
    expect(trackSpy).not.toHaveBeenCalled();

    entitlementsMock.mockReturnValue(entitlement(true, { lookupFailed: true }));
    renderSection();
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it("never fires for a Craft grower", () => {
    entitlementsMock.mockReturnValue(entitlement(true));
    renderSection();
    expect(trackSpy).not.toHaveBeenCalled();
  });
});

/**
 * Tests for ProBlueprintOverlay — the presenter that renders a
 * BlueprintOverlayViewModel as a green/amber/red per-metric readout.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProBlueprintOverlay } from "@/components/ProBlueprintOverlay";
import {
  buildBlueprintOverlayViewModel,
  type BuildBlueprintOverlayInput,
} from "@/lib/blueprintOverlayViewModel";

const METRICS = ["vpdKpa", "tempC", "rh", "ppfd", "dli", "ec", "ph"] as const;

function healthySeedling(): BuildBlueprintOverlayInput {
  return {
    stage: "seedling",
    snapshot: { source: "live", temp: 25, rh: 75, vpd: 0.6, ppfd: 200 },
    latestFeeding: { ec: 0.7, ph: 6.0 },
    dli: null,
    isDay: true,
  };
}

function renderVm(input: BuildBlueprintOverlayInput) {
  return render(<ProBlueprintOverlay vm={buildBlueprintOverlayViewModel(input)} />);
}

describe("ProBlueprintOverlay", () => {
  it("renders the stage label and all seven metric rows", () => {
    renderVm(healthySeedling());
    expect(screen.getByTestId("pro-blueprint-overlay-stage").textContent).toBe("Seedling");
    for (const m of METRICS) {
      expect(screen.getByTestId(`pro-blueprint-overlay-row-${m}`)).toBeTruthy();
    }
  });

  it("colors rows by tone (green in band, neutral when unscored)", () => {
    renderVm(healthySeedling());
    for (const m of ["vpdKpa", "tempC", "rh", "ppfd", "ec", "ph"] as const) {
      expect(screen.getByTestId(`pro-blueprint-overlay-row-${m}`).getAttribute("data-tone")).toBe(
        "green",
      );
    }
    // seedling has no DLI band and no value → neutral (not scored)
    expect(screen.getByTestId("pro-blueprint-overlay-row-dli").getAttribute("data-tone")).toBe(
      "neutral",
    );
  });

  it("flags a red excursion", () => {
    renderVm({
      ...healthySeedling(),
      // temp 30 vs seedling day band 24-26 → out_high (red)
      snapshot: { source: "live", temp: 30, rh: 75, vpd: 0.6, ppfd: 200 },
    });
    expect(screen.getByTestId("pro-blueprint-overlay-row-tempC").getAttribute("data-tone")).toBe(
      "red",
    );
  });

  it("formats values with units and shows the target band", () => {
    renderVm(healthySeedling());
    expect(screen.getByTestId("pro-blueprint-overlay-value-tempC").textContent).toContain("25");
    expect(screen.getByTestId("pro-blueprint-overlay-value-tempC").textContent).toContain("°C");
    // seedling temp band 24-26
    expect(screen.getByTestId("pro-blueprint-overlay-row-tempC").textContent).toContain("24");
    expect(screen.getByTestId("pro-blueprint-overlay-row-tempC").textContent).toContain("26");
  });

  it("shows a nudge on a missing metric and a dash for its value", () => {
    renderVm({ stage: "seedling", snapshot: null, latestFeeding: null, dli: null, isDay: true });
    expect(screen.getByTestId("pro-blueprint-overlay-nudge-ec")).toBeTruthy();
    expect(screen.getByTestId("pro-blueprint-overlay-value-ec").textContent).toContain("—");
  });

  it("renders summary chips with counts (6 in band, 1 no-data for healthy seedling)", () => {
    renderVm(healthySeedling());
    expect(screen.getByTestId("pro-blueprint-summary-green").textContent).toContain("6");
    expect(screen.getByTestId("pro-blueprint-summary-neutral").textContent).toContain("1");
  });

  it("prompts to set the stage when it is unknown", () => {
    renderVm({ stage: "banana", snapshot: null, latestFeeding: null, dli: null });
    expect(screen.getByTestId("pro-blueprint-overlay-stage").textContent).toBe("Stage not set");
    expect(screen.getByTestId("pro-blueprint-overlay-stage-unknown")).toBeTruthy();
  });
});

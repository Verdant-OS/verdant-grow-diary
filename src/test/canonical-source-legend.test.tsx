import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CanonicalSourceLegend, {
  CANONICAL_SOURCE_LEGEND_ENTRIES,
  CANONICAL_SOURCE_LEGEND_TRIGGER_LABEL,
} from "@/components/CanonicalSourceLegend";
import SensorIngestAuditReport from "@/components/SensorIngestAuditReport";
import EcowittBridgeTroubleshootingPanel from "@/components/EcowittBridgeTroubleshootingPanel";

describe("CanonicalSourceLegend", () => {
  it("has a keyboard-reachable trigger with an accessible name", () => {
    render(<CanonicalSourceLegend />);
    const trigger = screen.getByRole("button", {
      name: CANONICAL_SOURCE_LEGEND_TRIGGER_LABEL,
    });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the legend content on click and exposes all six canonical sources", () => {
    render(<CanonicalSourceLegend />);
    const trigger = screen.getByTestId("canonical-source-legend-trigger");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    for (const e of CANONICAL_SOURCE_LEGEND_ENTRIES) {
      expect(screen.getByTestId(`canonical-source-legend-entry-${e.key}`)).toBeTruthy();
    }
  });

  it("does not classify stale or invalid as healthy", () => {
    render(<CanonicalSourceLegend defaultOpen />);
    const stale = screen.getByTestId("canonical-source-legend-entry-stale").textContent ?? "";
    const invalid = screen.getByTestId("canonical-source-legend-entry-invalid").textContent ?? "";
    expect(stale.toLowerCase()).not.toMatch(/healthy/);
    expect(invalid.toLowerCase()).not.toMatch(/healthy/);
    expect(stale.toLowerCase()).toMatch(/(not.*current|old)/);
    expect(invalid.toLowerCase()).toMatch(/(bad|suspicious|invalid)/);
  });

  it("does not list ecowitt as a canonical source", () => {
    render(<CanonicalSourceLegend defaultOpen />);
    const keys = CANONICAL_SOURCE_LEGEND_ENTRIES.map((e) => e.key);
    expect(keys).not.toContain("ecowitt" as never);
    const content = screen.getByTestId("canonical-source-legend-content").textContent ?? "";
    expect(content).not.toMatch(/canonical.*ecowitt/i);
  });
});

describe("CanonicalSourceLegend — surfaces", () => {
  it("is present in the sensor ingest audit report header", () => {
    render(<SensorIngestAuditReport input={{ rows: [] }} />);
    expect(screen.getByTestId("audit-source-legend")).toBeTruthy();
  });

  it("is present in the EcoWitt bridge troubleshooting panel", () => {
    render(
      <EcowittBridgeTroubleshootingPanel
        input={{
          env: {
            tentIdConfigured: true,
            bridgeTokenStatus: "present",
            channelMapJsonValid: true,
          },
          lastReading: null,
        }}
      />,
    );
    expect(screen.getByTestId("troubleshooting-source-legend")).toBeTruthy();
  });
});

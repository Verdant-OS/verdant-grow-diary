/**
 * The Alerts header showed "Temp —–85°F." for a temperature target with a
 * maximum and no minimum (core loop walk, 2026-11-18). A one-sided target
 * now reads "up to 85°F" or "at least 70°F"; both bounds still read "70–85".
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertsContextHeader from "@/components/AlertsContextHeader";
import {
  buildAlertsHeaderContext,
  formatAlertsHeaderRangeBounds,
} from "@/lib/alertFreshnessContext";
import type { GrowTargets } from "@/lib/environmentTargetComparison";

vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

const NOW = Date.parse("2026-11-18T01:00:00Z");

function targets(temp: { min: number | null; max: number | null }): GrowTargets {
  return {
    temp,
    rh: { min: null, max: 60 },
    vpd: { min: 0, max: 1.2 },
  } as unknown as GrowTargets;
}

describe("formatAlertsHeaderRangeBounds", () => {
  it("keeps the two-sided range unchanged", () => {
    expect(formatAlertsHeaderRangeBounds(70, 85)).toBe("70–85");
  });
  it("reads a max-only target as 'up to'", () => {
    expect(formatAlertsHeaderRangeBounds(null, 85)).toBe("up to 85");
  });
  it("reads a min-only target as 'at least'", () => {
    expect(formatAlertsHeaderRangeBounds(70, null)).toBe("at least 70");
  });
  it("treats zero as a real bound", () => {
    expect(formatAlertsHeaderRangeBounds(0, 1.2)).toBe("0–1.2");
    expect(formatAlertsHeaderRangeBounds(0, null)).toBe("at least 0");
  });
  it("treats a non-finite bound as missing", () => {
    expect(formatAlertsHeaderRangeBounds(Number.NaN, 85)).toBe("up to 85");
    expect(formatAlertsHeaderRangeBounds(null, null)).toBe("—");
  });
});

describe("AlertsContextHeader one-sided target ranges", () => {
  it("renders a max-only °F temperature target without the dash pair", () => {
    const freshnessArgs = { status: "idle" as const, snapshot: null, now: NOW };
    const vm = buildAlertsHeaderContext({
      growName: "Test grow",
      stage: "veg",
      targets: targets({ min: null, max: 29.5 }),
      snapshot: null,
      status: "idle",
      now: NOW,
      tempUnit: "fahrenheit",
    });
    render(<AlertsContextHeader vm={vm} freshnessArgs={freshnessArgs} />);

    const temp = screen.getByTestId("alerts-context-header-range-temp");
    expect(temp.textContent).toContain("Temp up to 85°F.");
    expect(temp.textContent).not.toContain("—");

    expect(screen.getByTestId("alerts-context-header-range-rh").textContent).toContain(
      "RH up to 60%.",
    );
    expect(screen.getByTestId("alerts-context-header-range-vpd").textContent).toContain(
      "VPD 0–1.2 kPa.",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDashboardStabilityReadings,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";
import {
  mergeVpdStabilityInputs,
  vpdStabilityInputsFromWideReadings,
} from "@/lib/vpdStabilityInputRules";
import type { SensorReading } from "@/mock";

const NOW = new Date("2026-10-15T12:00:00.000Z");

function manualWideVpd(iso: string, vpd: number): SensorReading {
  return {
    ts: iso,
    capturedAt: iso,
    tentId: "tent-1",
    temp: 0,
    rh: 0,
    vpd,
    co2: 0,
    soil: 0,
    observedMetrics: ["vpd"],
    source: "manual",
    status: "usable",
  };
}

describe("Dashboard single-tent Quick Log VPD stability merge (#2130)", () => {
  it("grades stability from manual VPD when stored tent rows never observed VPD", () => {
    const tentRows: DashboardSensorEvidenceRow[] = [
      {
        tent_id: "tent-1",
        metric: "temperature_c",
        value: 24,
        ts: "2026-10-15T11:50:00.000Z",
        source: "live",
        quality: "ok",
        raw_payload: null,
      },
    ];
    const storedOnly = buildDashboardStabilityReadings(tentRows);
    expect(storedOnly).toEqual([]);

    const merged = mergeVpdStabilityInputs(
      storedOnly,
      vpdStabilityInputsFromWideReadings([manualWideVpd("2026-10-15T11:55:00.000Z", 1.0)]),
    );
    expect(merged).toHaveLength(1);

    const withoutManuals = computeEnvironmentStability(storedOnly, { stage: "veg", now: NOW });
    const withManuals = computeEnvironmentStability(merged, { stage: "veg", now: NOW });

    expect(withoutManuals.status).toBe("unavailable");
    expect(withManuals.status).toBe("stable");
  });
});

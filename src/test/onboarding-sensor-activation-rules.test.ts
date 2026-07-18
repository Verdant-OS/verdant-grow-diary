import { describe, expect, it } from "vitest";
import { countActivatingSensorReadings } from "@/lib/onboardingSensorActivationRules";

const diagnosticPayload = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    confidence: "test",
  },
};

const physicalGatewayPayload = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.3",
      model: "GW2000",
      dateutc: "2026-06-20 10:00:00",
    },
  },
};

describe("countActivatingSensorReadings", () => {
  it("counts only non-diagnostic live, manual, and CSV evidence", () => {
    expect(
      countActivatingSensorReadings([
        { source: "live", quality: "ok" },
        { source: "manual", quality: "ok" },
        { source: "csv", quality: "ok" },
        { source: " MANUAL ", quality: "ok" },
        { source: "demo", quality: "ok" },
        { source: "stale", quality: "ok" },
        { source: "invalid", quality: "ok" },
        { source: "mystery_bridge", quality: "ok" },
        { source: "live" },
        {},
      ]),
    ).toBe(3);
  });

  it("does not let a canonical-live diagnostic row activate onboarding", () => {
    expect(
      countActivatingSensorReadings([
        { source: "live", quality: "ok", raw_payload: diagnosticPayload },
      ]),
    ).toBe(0);
  });

  it("keeps a physically proven gateway row eligible through the shared exception", () => {
    expect(
      countActivatingSensorReadings([
        { source: "live", quality: "ok", raw_payload: physicalGatewayPayload },
      ]),
    ).toBe(1);
  });

  it("is null-safe, deterministic, and does not mutate its input", () => {
    const rows = [
      { source: "manual", quality: "ok" },
      { source: "live", quality: "ok", raw_payload: diagnosticPayload },
    ] as const;
    const before = JSON.stringify(rows);

    expect(countActivatingSensorReadings(null)).toBe(0);
    expect(countActivatingSensorReadings(undefined)).toBe(0);
    expect(countActivatingSensorReadings(rows)).toBe(1);
    expect(countActivatingSensorReadings(rows)).toBe(1);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

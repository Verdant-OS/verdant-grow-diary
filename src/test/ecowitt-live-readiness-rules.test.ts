import { describe, expect, it } from "vitest";
import { evaluateEcowittLiveReadiness } from "@/lib/ecowittLiveReadinessRules";

const READY_INPUT = {
  mosquittoRunning: true,
  diyUploadConfigured: true,
  listenerReachable: true,
  mqttPayloadSeen: true,
  validPayloadAccepted: true,
  invalidPayloadRejected: true,
  backendEvidencePresent: true,
  realDeviceComparisonPresent: true,
  sourceLabel: "live",
  capturedAtRecent: true,
  confidencePresent: true,
  tentIdPresent: true,
  suspiciousFlags: [],
  metricComparisons: [
    {
      metric: "temperature_c" as const,
      controllerValue: 24.7,
      backendValue: 24.8,
      tolerance: 0.5,
      unit: "°C",
    },
    {
      metric: "humidity_pct" as const,
      controllerValue: 58,
      backendValue: 58.3,
      tolerance: 2,
      unit: "%",
    },
  ],
};

describe("evaluateEcowittLiveReadiness", () => {
  it("blocks by default and never allows live/action side effects", () => {
    const result = evaluateEcowittLiveReadiness({});
    expect(result.verdict).toBe("blocked");
    expect(result.canCallLive).toBe(false);
    expect(result.canCreateAlerts).toBe(false);
    expect(result.canCreateActionQueueItems).toBe(false);
    expect(result.requiredEvidenceMissing).toContain("Real EcoWitt controller/app comparison present");
  });

  it("returns partial when local pipeline works but real device comparison is missing", () => {
    const result = evaluateEcowittLiveReadiness({
      ...READY_INPUT,
      realDeviceComparisonPresent: false,
      metricComparisons: [],
    });
    expect(result.verdict).toBe("partial");
    expect(result.canCallLive).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/real device comparison/i);
    expect(result.blockers.join(" ")).toMatch(/real ecowitt controller/i);
  });

  it("returns ready only when real evidence matches backend within tolerance", () => {
    const result = evaluateEcowittLiveReadiness(READY_INPUT);
    expect(result.verdict).toBe("ready");
    expect(result.canCallLive).toBe(true);
    expect(result.canCreateAlerts).toBe(false);
    expect(result.canCreateActionQueueItems).toBe(false);
    expect(result.blockers).toEqual([]);
  });

  it("returns mismatch when controller/backend values disagree", () => {
    const result = evaluateEcowittLiveReadiness({
      ...READY_INPUT,
      metricComparisons: [
        {
          metric: "temperature_c",
          controllerValue: 24.7,
          backendValue: 30.1,
          tolerance: 0.5,
          unit: "°C",
        },
      ],
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.canCallLive).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/temperature_c mismatch/i);
  });

  it("blocks suspicious telemetry even when other fields are present", () => {
    const result = evaluateEcowittLiveReadiness({
      ...READY_INPUT,
      suspiciousFlags: ["humidity stuck at 100"],
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.canCallLive).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/humidity stuck at 100/i);
  });

  it("blocks missing or wrong source labels", () => {
    const missing = evaluateEcowittLiveReadiness({ ...READY_INPUT, sourceLabel: null });
    expect(missing.verdict).toBe("mismatch");
    expect(missing.blockers).toContain("Source label is missing.");

    const demo = evaluateEcowittLiveReadiness({ ...READY_INPUT, sourceLabel: "demo" });
    expect(demo.verdict).toBe("mismatch");
    expect(demo.blockers.join(" ")).toMatch(/not live\/ecowitt/i);
  });

  it("does not let local sender evidence alone prove live", () => {
    const result = evaluateEcowittLiveReadiness({
      mosquittoRunning: true,
      listenerReachable: true,
      mqttPayloadSeen: true,
      validPayloadAccepted: true,
      invalidPayloadRejected: true,
      backendEvidencePresent: true,
      realDeviceComparisonPresent: false,
      sourceLabel: "live",
      capturedAtRecent: true,
      confidencePresent: true,
      tentIdPresent: true,
    });
    expect(result.verdict).toBe("partial");
    expect(result.canCallLive).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildSensorTruthCopyGuard } from "@/lib/sensorTruthCopyGuardRules";

describe("sensorTruthCopyGuardRules", () => {
  it("allows healthy live copy only for live usable telemetry", () => {
    const vm = buildSensorTruthCopyGuard({ sourceTone: "live", status: "usable" });

    expect(vm).toMatchObject({
      sourceTone: "live",
      status: "usable",
      verdict: "healthy_live",
      label: "Live sensor · current",
      canDescribeAsLive: true,
      canDescribeAsCurrent: true,
      canDescribeAsHealthyLive: true,
      canUseAsContext: true,
    });
  });

  it("blocks live-source telemetry when status is not usable", () => {
    const statuses = ["stale", "invalid", "needs_review", "no_data"] as const;

    for (const status of statuses) {
      const vm = buildSensorTruthCopyGuard({ sourceTone: "live", status });
      expect(vm.canDescribeAsLive).toBe(false);
      expect(vm.canDescribeAsCurrent).toBe(false);
      expect(vm.canDescribeAsHealthyLive).toBe(false);
      expect(vm.canUseAsContext).toBe(false);
      expect(vm.helper).not.toMatch(/fresh validated live/i);
    }
  });

  it("treats manual readings as useful context but never live", () => {
    const vm = buildSensorTruthCopyGuard({ sourceTone: "manual", status: "usable" });

    expect(vm).toMatchObject({
      verdict: "manual_context",
      label: "Manual reading",
      canUseAsContext: true,
      canDescribeAsLive: false,
      canDescribeAsCurrent: false,
      canDescribeAsHealthyLive: false,
    });
    expect(vm.helper).toContain("Grower-entered");
  });

  it("treats CSV as historical context but never live", () => {
    const vm = buildSensorTruthCopyGuard({ sourceTone: "csv", status: "usable" });

    expect(vm).toMatchObject({
      verdict: "historical_context",
      label: "CSV import",
      canUseAsContext: true,
      canDescribeAsLive: false,
      canDescribeAsCurrent: false,
      canDescribeAsHealthyLive: false,
    });
    expect(vm.helper).toMatch(/historical/i);
  });

  it("blocks demo data even when a caller passes usable status", () => {
    const vm = buildSensorTruthCopyGuard({ sourceTone: "demo", status: "usable" });

    expect(vm).toMatchObject({
      verdict: "demo_blocked",
      label: "Demo data",
      canUseAsContext: false,
      canDescribeAsLive: false,
      canDescribeAsCurrent: false,
      canDescribeAsHealthyLive: false,
    });
    expect(vm.helper).toMatch(/sample data only/i);
  });

  it("blocks stale and invalid readings", () => {
    const stale = buildSensorTruthCopyGuard({ sourceTone: "stale", status: "stale" });
    const invalid = buildSensorTruthCopyGuard({ sourceTone: "invalid", status: "invalid" });

    expect(stale.verdict).toBe("stale_blocked");
    expect(stale.canUseAsContext).toBe(false);
    expect(stale.helper).toMatch(/too old/i);

    expect(invalid.verdict).toBe("invalid_blocked");
    expect(invalid.canUseAsContext).toBe(false);
    expect(invalid.helper).toMatch(/failed validation/i);
  });

  it("normalizes unknown or unrecognized source labels defensively", () => {
    const unknown = buildSensorTruthCopyGuard({ sourceTone: "ecowitt_mqtt", status: "usable" });

    expect(unknown).toMatchObject({
      sourceTone: "unknown",
      verdict: "unknown_blocked",
      label: "Unknown source",
      canUseAsContext: false,
      canDescribeAsLive: false,
      canDescribeAsCurrent: false,
      canDescribeAsHealthyLive: false,
    });
    expect(unknown.helper).toMatch(/source is unknown/i);
  });

  it("uses no-data copy when status is no_data", () => {
    const vm = buildSensorTruthCopyGuard({ sourceTone: null, status: "no_data" });

    expect(vm).toMatchObject({
      sourceTone: "unknown",
      status: "no_data",
      verdict: "no_data",
      label: "No sensor data",
      canUseAsContext: false,
      canDescribeAsLive: false,
      canDescribeAsCurrent: false,
      canDescribeAsHealthyLive: false,
    });
    expect(vm.helper).toMatch(/no sensor reading/i);
  });

  it("never uses live/current/healthy permission for non-live source tones", () => {
    const sourceTones = ["manual", "csv", "demo", "stale", "invalid", "unknown"] as const;

    for (const sourceTone of sourceTones) {
      const vm = buildSensorTruthCopyGuard({ sourceTone, status: "usable" });
      expect(vm.canDescribeAsLive).toBe(false);
      expect(vm.canDescribeAsCurrent).toBe(false);
      expect(vm.canDescribeAsHealthyLive).toBe(false);
    }
  });
});

/**
 * Target-comparison alert reasons include configured bands when requested (#2179).
 */
import { describe, expect, it } from "vitest";
import { buildEnvironmentAlerts } from "@/lib/environmentAlerts";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

describe("buildEnvironmentAlerts includeConfiguredRangeInTargetBreachReason (#2179)", () => {
  it("embeds observed value and configured RH band in the breach reason", () => {
    const snap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      rh: 85,
      temp: 24,
      vpd: 1.0,
    };
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality: evaluateSensorQuality(snap),
      targets: compareSnapshotToTargets(snap, { rh: { min: 50, max: 70 } }),
      stage: "seedling",
      includeConfiguredRangeInTargetBreachReason: true,
    });

    const rh = derived.find((a) => a.metric === "rh");
    expect(rh?.title).toBe("Humidity above target");
    expect(rh?.reason).toContain("85%");
    expect(rh?.reason).toContain("50–70%");
    expect(rh?.reason).toMatch(/configured target/i);
  });

  it("keeps legacy terse reasons when includeConfiguredRangeInTargetBreachReason is false", () => {
    const snap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      rh: 85,
    };
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality: evaluateSensorQuality(snap),
      targets: compareSnapshotToTargets(snap, { rh: { min: 50, max: 70 } }),
      includeConfiguredRangeInTargetBreachReason: false,
    });
    const rh = derived.find((a) => a.metric === "rh");
    expect(rh?.reason).toBe("Humidity is above the configured maximum.");
    expect(rh?.reason).not.toContain("50–70%");
  });
});

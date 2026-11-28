/**
 * #3124: a manual temperature and RH reading with no stored VPD must raise the
 * VPD alert the tent page already shows ("Above Veg VPD range"), on both the
 * default-threshold and the target-comparison paths, and say the VPD was
 * calculated, not measured.
 */
import { describe, expect, it } from "vitest";
import { snapshotFromReadings, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { buildEnvironmentAlerts } from "@/lib/environmentAlerts";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";
import {
  CALCULATED_VPD_ALERT_NOTE,
  hasCalculatedVpd,
  withCaptureDerivedVpd,
} from "@/lib/alertSnapshotDerivedVpdRules";

const NOW = Date.parse("2026-11-27T12:10:00.000Z");
const AT = "2026-11-27T12:00:00.000Z";

// 28 °C at 62 % RH, the QA repro scale: about 1.4–1.5 kPa against 0.8–1.2 kPa Veg.
function manualTempRhSnapshot(): SensorSnapshot {
  const snap = snapshotFromReadings([
    { id: "r-temp", metric: "temperature_c", value: 29, ts: AT, source: "manual", tent_id: "t1" },
    { id: "r-rh", metric: "humidity_pct", value: 63, ts: AT, source: "manual", tent_id: "t1" },
  ]);
  if (!snap) throw new Error("fixture snapshot");
  return snap;
}

function alertsFor(
  snapshot: SensorSnapshot | null,
  targets: Parameters<typeof compareSnapshotToTargets>[1],
) {
  return buildEnvironmentAlerts({
    snapshot,
    quality: evaluateSensorQuality(snapshot),
    targets: compareSnapshotToTargets(snapshot, targets),
    stage: "veg",
    now: NOW,
    includeConfiguredRangeInTargetBreachReason: true,
  });
}

describe("alert VPD calculated from a same-capture temperature and RH (#3124)", () => {
  it("raises the Veg VPD alert from the default thresholds, marked as calculated", () => {
    const base = manualTempRhSnapshot();
    expect(base.vpd).toBeNull();
    const snapshot = withCaptureDerivedVpd(base);
    expect(snapshot?.vpd).toBe(calculateVpdKpa({ tempC: 29, rhPercent: 63 }));
    expect(hasCalculatedVpd(snapshot)).toBe(true);
    expect(snapshot?.metric_refs?.vpd).toBeUndefined();

    const vpd = alertsFor(snapshot, null).find((a) => a.metric === "vpd");
    expect(vpd?.id).toBe("default_target:vpd:high");
    expect(vpd?.title).toBe("VPD above stage range");
    expect(vpd?.reason).toContain(CALCULATED_VPD_ALERT_NOTE);
  });

  it("raises the VPD target alert when the grow has targets, marked as calculated", () => {
    const snapshot = withCaptureDerivedVpd(manualTempRhSnapshot());
    const vpd = alertsFor(snapshot, { vpd: { min: 0.8, max: 1.2 } }).find(
      (a) => a.metric === "vpd",
    );
    expect(vpd?.id).toBe("target:vpd:high");
    expect(vpd?.reason).toContain(CALCULATED_VPD_ALERT_NOTE);
  });

  it("keeps a stored VPD and adds no calculated note", () => {
    const stored = snapshotFromReadings([
      { id: "a", metric: "temperature_c", value: 29, ts: AT, source: "manual" },
      { id: "b", metric: "humidity_pct", value: 63, ts: AT, source: "manual" },
      { id: "c", metric: "vpd_kpa", value: 1.0, ts: AT, source: "manual" },
    ]);
    const snapshot = withCaptureDerivedVpd(stored);
    expect(snapshot).toBe(stored);
    expect(hasCalculatedVpd(snapshot)).toBe(false);
    expect(alertsFor(snapshot, null).some((a) => a.metric === "vpd")).toBe(false);
  });

  it("does not calculate when temperature and RH come from different captures", () => {
    const merged = {
      ...manualTempRhSnapshot(),
      manual_metric_refs: { temp: { captured_at: "2026-11-27T12:05:00.000Z" } },
    };
    expect(withCaptureDerivedVpd(merged)).toBe(merged);
  });

  it("does not calculate without both temperature and RH", () => {
    const tempOnly = { ...manualTempRhSnapshot(), rh: null };
    expect(withCaptureDerivedVpd(tempOnly)).toBe(tempOnly);
    expect(withCaptureDerivedVpd(null)).toBeNull();
  });
});

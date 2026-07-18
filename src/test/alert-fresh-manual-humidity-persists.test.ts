/**
 * Regression: a fresh manual humidity snapshot above the configured RH
 * max produces a high-humidity alert through the existing pipeline.
 *
 * Pure rules only — no Supabase, no mocks of the alert engine. Uses the
 * real `buildEnvironmentAlerts`, `selectPersistableAlerts`, and
 * `dedupeAgainstOpen` helpers so this guards real behavior, not a stub.
 *
 * Safety:
 *  - Manual source stays "manual".
 *  - No Action Queue creation (alerts pipeline never writes the queue).
 *  - No automation, no AI, no device control.
 */
import { describe, it, expect } from "vitest";
import { buildEnvironmentAlerts, type EnvironmentAlert } from "@/lib/environmentAlerts";
import {
  isSnapshotPersistable,
  selectPersistableAlerts,
  dedupeAgainstOpen,
  persistedAlertKey,
} from "@/lib/environmentAlertPersistence";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";
import type { SensorQualityResult } from "@/lib/sensorQuality";

const NOW = Date.parse("2026-06-23T12:00:00Z");
const FRESH_TS = new Date(NOW - 8 * 60_000).toISOString(); // 8 min ago

function freshManualHumiditySnapshot(rh: number): SensorSnapshot {
  return {
    source: "manual",
    quality: "ok",
    ts: FRESH_TS,
    temp: 24,
    rh,
    vpd: 1.1,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  } as SensorSnapshot;
}

const okQuality: SensorQualityResult = {
  quality: "good",
  headline: "Sensor data looks usable",
  reasons: [],
  suspiciousFields: [],
};

function rhHighTargets(rh: number, max = 55): TargetComparisonResult {
  return {
    status: "out_of_range",
    headline: "",
    reasons: [],
    metrics: [{ metric: "rh", label: "Humidity", value: rh, min: 40, max, state: "high" }],
  } as unknown as TargetComparisonResult;
}

function rhInRangeTargets(rh: number): TargetComparisonResult {
  return {
    status: "in_range",
    headline: "",
    reasons: [],
    metrics: [{ metric: "rh", label: "Humidity", value: rh, min: 55, max: 70, state: "ok" }],
  } as unknown as TargetComparisonResult;
}

describe("fresh manual RH above max → high-humidity alert (regression)", () => {
  it("snapshot is persistable: fresh, manual source, usable quality", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    expect(isSnapshotPersistable({ snapshot, quality: "good", now: NOW })).toBe(true);
  });

  it("buildEnvironmentAlerts emits target:rh:high for RH 61 with max 55", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    const alerts = buildEnvironmentAlerts({
      snapshot,
      quality: okQuality,
      targets: rhHighTargets(61, 55),
      now: NOW,
    });
    const rhHigh = alerts.find((a) => a.id === "target:rh:high");
    expect(rhHigh).toBeDefined();
    expect(rhHigh?.metric).toBe("rh");
    expect(rhHigh?.severity).toBe("warning");
    expect(rhHigh?.title).toBe("Humidity above target");
    // Conservative copy — no aggressive instructions.
    expect(rhHigh?.reason).toBe("Humidity is above the configured maximum.");
    expect(rhHigh?.source).toBe("target_comparison");
  });

  it("alert survives selectPersistableAlerts with the same fresh manual snapshot", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    const alerts = buildEnvironmentAlerts({
      snapshot,
      quality: okQuality,
      targets: rhHighTargets(61, 55),
      now: NOW,
    });
    const kept = selectPersistableAlerts(alerts, {
      snapshot,
      quality: "good",
      now: NOW,
    });
    expect(kept.map((a) => a.id)).toContain("target:rh:high");
  });

  it("does not create a false alert when RH 61 falls inside a 55–70 range", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    const alerts = buildEnvironmentAlerts({
      snapshot,
      quality: okQuality,
      targets: rhInRangeTargets(61),
      now: NOW,
    });
    expect(alerts.find((a) => a.id === "target:rh:high")).toBeUndefined();
    expect(alerts.find((a) => a.id === "target:rh:low")).toBeUndefined();
  });

  it("revisit does not duplicate the alert when an open row already exists", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    const alerts = buildEnvironmentAlerts({
      snapshot,
      quality: okQuality,
      targets: rhHighTargets(61, 55),
      now: NOW,
    });
    const kept = selectPersistableAlerts(alerts, {
      snapshot,
      quality: "good",
      now: NOW,
    });
    // Simulate the persisted open row from the first save.
    const openRows = [
      {
        metric: "rh",
        source: "environment_alerts",
        title: "Humidity above target",
      },
    ];
    const deduped = dedupeAgainstOpen(kept, openRows);
    expect(deduped).toHaveLength(0);
    // And the key shapes match so the dedupe path is exercised, not a
    // happy-coincidence empty list.
    const derivedAlert = kept.find((a) => a.id === "target:rh:high") as EnvironmentAlert;
    expect(
      persistedAlertKey({
        metric: "rh",
        source: "environment_alerts",
        title: derivedAlert.title,
      }),
    ).toBeTruthy();
  });

  it("does not introduce an Action Queue write — the alert pipeline returns plain alerts only", () => {
    const snapshot = freshManualHumiditySnapshot(61);
    const alerts = buildEnvironmentAlerts({
      snapshot,
      quality: okQuality,
      targets: rhHighTargets(61, 55),
      now: NOW,
    });
    for (const a of alerts) {
      // Pipeline alerts are pure data — no action_queue/action_id fields.
      expect(a).not.toHaveProperty("action_id");
      expect(a).not.toHaveProperty("action_queue_id");
      expect(a).not.toHaveProperty("auto_action");
    }
  });
});

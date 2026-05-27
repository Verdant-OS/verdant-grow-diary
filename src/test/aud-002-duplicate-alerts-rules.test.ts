/**
 * AUD-002: duplicate alerts (regression).
 *
 * Default-threshold environment alerts produce a `reason` field that inlines
 * the observed value and the snapshot timestamp. Previously the dedupe key
 * was built from `reason`, so two consecutive snapshots of the same rule
 * (e.g. "Temperature above default range") would generate two distinct keys
 * and insert two rows. This test pins the contract that the dedup key is
 * stable across snapshots for the same rule.
 */
import { describe, it, expect } from "vitest";
import {
  derivedAlertKey,
  persistedAlertKey,
} from "@/lib/environmentAlertPersistence";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";

function mkDefaultThresholdAlert(reason: string): EnvironmentAlert {
  return {
    id: "default_target:temp:high",
    severity: "warning",
    metric: "temp",
    title: "Temperature above default range",
    reason,
    source: "default_thresholds",
    createdAt: "2026-05-27T00:00:00.000Z",
  };
}

describe("AUD-002 — alert dedup key is stable across snapshots", () => {
  it("two snapshots of the same rule produce the same derived key", () => {
    const a1 = mkDefaultThresholdAlert(
      "Temperature is above the default safe range. Observed 30.1 °C (default range 19 °C–28 °C). Reading at 2026-05-27T12:00:00Z.",
    );
    const a2 = mkDefaultThresholdAlert(
      "Temperature is above the default safe range. Observed 30.4 °C (default range 19 °C–28 °C). Reading at 2026-05-27T12:05:00Z.",
    );
    expect(derivedAlertKey(a1)).toBe(derivedAlertKey(a2));
  });

  it("derivedAlertKey matches persistedAlertKey for a row created from any earlier snapshot", () => {
    const fresh = mkDefaultThresholdAlert(
      "Temperature is above the default safe range. Observed 30.4 °C. Reading at 2026-05-27T12:05:00Z.",
    );
    const stored = persistedAlertKey({
      metric: "temp",
      source: "environment_alerts",
      title: "Temperature above default range",
    });
    expect(derivedAlertKey(fresh)).toBe(stored);
  });

  it("different rules on the same metric do not collide", () => {
    const high = mkDefaultThresholdAlert("anything");
    const low: EnvironmentAlert = {
      ...high,
      id: "default_target:temp:low",
      title: "Temperature below default range",
    };
    expect(derivedAlertKey(high)).not.toBe(derivedAlertKey(low));
  });
});

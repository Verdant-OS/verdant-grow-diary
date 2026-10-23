/**
 * withRejectedQualityRows (#2303): carry intake-rejected siblings on snapshots
 * built from eligible Dashboard rows so VPD projections can reject their capture.
 */
import { describe, expect, it } from "vitest";
import {
  withRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";

const FRESH = "2026-07-17T11:55:00.000Z";

function row(overrides: Partial<DashboardSensorEvidenceRow> = {}): DashboardSensorEvidenceRow {
  return {
    tent_id: "tent-1",
    ts: FRESH,
    metric: "vpd_kpa",
    value: 1.05,
    source: "live",
    quality: "ok",
    raw_payload: null,
    ...overrides,
  };
}

describe("withRejectedQualityRows", () => {
  it("attaches rejected quality siblings without changing eligible metrics", () => {
    const snapshot = snapshotFromReadings([
      { ts: FRESH, metric: "vpd_kpa", value: 1.05, source: "live" },
    ]);
    const degraded = row({ metric: "humidity_pct", quality: "degraded", value: 55 });
    const withRejected = withRejectedQualityRows(snapshot, [row(), degraded]);
    expect(withRejected?.rejected_quality_rows).toEqual([
      expect.objectContaining({ metric: "humidity_pct", quality: "degraded" }),
    ]);
  });

  it("returns the same snapshot when nothing was rejected and null when snapshot is null", () => {
    const snapshot = snapshotFromReadings([
      { ts: FRESH, metric: "vpd_kpa", value: 1.05, source: "live" },
    ]);
    expect(withRejectedQualityRows(snapshot, [row()])).toBe(snapshot);
    expect(withRejectedQualityRows(null, [row({ quality: "invalid" })])).toBeNull();
  });
});

/**
 * withRejectedQualityRows (#2437 / #2303): snapshots from evidence rows carry
 * quality-rejected siblings so Tonight and tent VPD can reject the same capture
 * the raw-row path would.
 */
import { describe, expect, it } from "vitest";
import {
  withRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";

const T = "2026-10-23T15:00:00.000Z";

function row(over: Partial<DashboardSensorEvidenceRow> = {}): DashboardSensorEvidenceRow {
  return {
    tent_id: "tent-1",
    ts: T,
    captured_at: T,
    metric: "vpd_kpa",
    value: 1.1,
    source: "live",
    quality: "ok",
    raw_payload: null,
    ...over,
  };
}

describe("withRejectedQualityRows", () => {
  it("returns null for a null snapshot", () => {
    expect(withRejectedQualityRows(null, [row()])).toBeNull();
  });

  it("returns the snapshot unchanged when there is no rejection evidence", () => {
    const snapshot = snapshotFromReadings([
      { ts: T, metric: "vpd_kpa", value: 1.1, source: "live" },
    ]);
    const out = withRejectedQualityRows(snapshot, [row()]);
    expect(out).toBe(snapshot);
    expect(out).not.toHaveProperty("rejected_quality_rows");
  });

  it("attaches rejected siblings from the raw read without mutating usable rows", () => {
    const snapshot = snapshotFromReadings([
      { ts: T, metric: "vpd_kpa", value: 1.1, source: "live" },
    ]);
    const raw = [row(), row({ metric: "humidity_pct", value: 55, quality: "degraded" })];
    const out = withRejectedQualityRows(snapshot, raw);
    expect(out).not.toBe(snapshot);
    expect(out?.rejected_quality_rows).toEqual([
      {
        metric: "humidity_pct",
        value: 55,
        captured_at: T,
        source: "live",
        quality: "degraded",
      },
    ]);
  });
});

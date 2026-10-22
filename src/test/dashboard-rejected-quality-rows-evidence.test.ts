/**
 * withRejectedQualityRows (#2303): snapshots assembled from eligible rows must
 * still carry quality-rejected siblings so Tonight/Tent Detail can withhold the
 * capture on fallback paths.
 */
import { describe, expect, it } from "vitest";
import {
  selectDashboardSensorEvidenceRows,
  withRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";

const T = "2026-07-17T11:55:00.000Z";

const PHYSICAL_GATEWAY_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-17 11:55:00",
    },
  },
};

function row(overrides: Partial<DashboardSensorEvidenceRow> = {}): DashboardSensorEvidenceRow {
  return {
    tent_id: "tent-1",
    ts: T,
    metric: "vpd_kpa",
    value: 1.05,
    source: "live",
    quality: "ok",
    raw_payload: null,
    ...overrides,
  };
}

function snapshotFromEvidence(evidence: DashboardSensorEvidenceRow[]) {
  return snapshotFromReadings(
    evidence.map(({ ts, metric, value, source }) => ({
      ts,
      metric,
      value: value as number,
      source,
    })),
  );
}

describe("withRejectedQualityRows", () => {
  it("returns the same snapshot object when no rows were dropped for quality", () => {
    const raw = [
      row({ metric: "vpd_kpa", value: 1.05 }),
      row({ metric: "humidity_pct", value: 55 }),
    ];
    const snap = snapshotFromEvidence(selectDashboardSensorEvidenceRows(raw));
    expect(withRejectedQualityRows(snap, raw)).toBe(snap);
    expect(snap).not.toHaveProperty("rejected_quality_rows");
  });

  it("attaches rejected siblings so fallback projections can withhold the capture", () => {
    const raw = [
      row({ metric: "vpd_kpa", value: 1.05 }),
      row({
        metric: "humidity_pct",
        value: 55,
        quality: "degraded",
        raw_payload: PHYSICAL_GATEWAY_PAYLOAD,
      }),
    ];
    const snap = snapshotFromEvidence(selectDashboardSensorEvidenceRows(raw));
    const enriched = withRejectedQualityRows(snap, raw);
    expect(enriched).not.toBe(snap);
    expect(enriched?.rejected_quality_rows).toEqual([
      expect.objectContaining({
        metric: "humidity_pct",
        quality: "degraded",
        captured_at: T,
      }),
    ]);
  });

  it("passes through null snapshots", () => {
    expect(withRejectedQualityRows(null, [row({ quality: "degraded" })])).toBeNull();
  });
});

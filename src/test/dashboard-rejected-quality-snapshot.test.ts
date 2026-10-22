/**
 * Regression: `withRejectedQualityRows` attaches intake-rejected siblings to a
 * snapshot so Tonight and the tent VPD paths can reject a capture the raw-row
 * filter dropped (#2303, Codex P1 at 0994ea2a).
 */
import { describe, expect, it } from "vitest";
import {
  withRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";

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

const snapshot = {
  source: "live" as const,
  ts: FRESH,
  temp: 24,
  rh: 55,
  vpd: 1.05,
  co2: null,
  soil: null,
  soil_ec: null,
  soil_temp: null,
  ppfd: null,
};

describe("withRejectedQualityRows", () => {
  it("returns null when the snapshot is null", () => {
    expect(withRejectedQualityRows(null, [row()])).toBeNull();
  });

  it("leaves the snapshot unchanged when every raw row passed the evidence filter", () => {
    expect(withRejectedQualityRows(snapshot, [row({ quality: "ok" })])).toBe(snapshot);
    expect(withRejectedQualityRows(snapshot, [row({ quality: "ok" })])).not.toHaveProperty(
      "rejected_quality_rows",
    );
  });

  it("attaches rejected siblings from the same raw read", () => {
    const flagged = withRejectedQualityRows(snapshot, [
      row({ metric: "humidity_pct", quality: "degraded" }),
    ]);
    expect(flagged).toMatchObject({
      vpd: 1.05,
      rejected_quality_rows: [
        expect.objectContaining({ metric: "humidity_pct", quality: "degraded" }),
      ],
    });
  });
});

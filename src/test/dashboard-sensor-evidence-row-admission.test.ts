/**
 * Deny-by-default admission for Dashboard telemetry rows (#2303 / #2459).
 */
import { describe, expect, it } from "vitest";
import {
  isDashboardSensorEvidenceRow,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";

const FRESH = "2026-07-17T11:55:00.000Z";

const DIAGNOSTIC_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: { confidence: "test", verdant_source: "live" },
};

function row(overrides: Partial<DashboardSensorEvidenceRow> = {}): DashboardSensorEvidenceRow {
  return {
    tent_id: "tent-1",
    ts: FRESH,
    metric: "vpd_kpa",
    value: 1.05,
    source: "live",
    quality: "ok",
    ...overrides,
  };
}

describe("isDashboardSensorEvidenceRow", () => {
  it("admits live, manual, csv, and pi_bridge rows with ok or missing quality", () => {
    expect(isDashboardSensorEvidenceRow(row())).toBe(true);
    expect(isDashboardSensorEvidenceRow(row({ source: "manual", quality: null }))).toBe(true);
    expect(isDashboardSensorEvidenceRow(row({ source: "csv" }))).toBe(true);
    expect(isDashboardSensorEvidenceRow(row({ source: "pi_bridge" }))).toBe(true);
  });

  it("rejects degraded quality, stale/invalid sources, demo, and diagnostic provenance", () => {
    expect(isDashboardSensorEvidenceRow(row({ quality: "degraded" }))).toBe(false);
    expect(isDashboardSensorEvidenceRow(row({ source: "stale" }))).toBe(false);
    expect(isDashboardSensorEvidenceRow(row({ source: "invalid" }))).toBe(false);
    expect(isDashboardSensorEvidenceRow(row({ source: "demo" }))).toBe(false);
    expect(isDashboardSensorEvidenceRow(row({ raw_payload: DIAGNOSTIC_PAYLOAD as never }))).toBe(
      false,
    );
  });
});

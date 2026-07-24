import { describe, expect, it } from "vitest";
import {
  countActivatingSensorReadings,
  countManualSnapshotQuickLogEvidence,
} from "@/lib/onboardingSensorActivationRules";

const diagnosticPayload = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    confidence: "test",
  },
};

const physicalGatewayPayload = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.3",
      model: "GW2000",
      dateutc: "2026-06-20 10:00:00",
    },
  },
};

describe("countActivatingSensorReadings", () => {
  it("counts only non-diagnostic live, manual, and CSV evidence", () => {
    expect(
      countActivatingSensorReadings([
        { source: "live" },
        { source: " MANUAL " },
        { source: "csv" },
        { source: "demo" },
        { source: "stale" },
        { source: "invalid" },
        { source: "mystery_bridge" },
        {},
      ]),
    ).toBe(3);
  });

  it("does not let a canonical-live diagnostic row activate onboarding", () => {
    expect(
      countActivatingSensorReadings([{ source: "live", raw_payload: diagnosticPayload }]),
    ).toBe(0);
  });

  it("keeps a physically proven gateway row eligible through the shared exception", () => {
    expect(
      countActivatingSensorReadings([{ source: "live", raw_payload: physicalGatewayPayload }]),
    ).toBe(1);
  });

  it("is null-safe, deterministic, and does not mutate its input", () => {
    const rows = [
      { source: "manual" },
      { source: "live", raw_payload: diagnosticPayload },
    ] as const;
    const before = JSON.stringify(rows);

    expect(countActivatingSensorReadings(null)).toBe(0);
    expect(countActivatingSensorReadings(undefined)).toBe(0);
    expect(countActivatingSensorReadings(rows)).toBe(1);
    expect(countActivatingSensorReadings(rows)).toBe(1);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("countManualSnapshotQuickLogEvidence", () => {
  const TENT = "tent-a";

  it("counts labeled manual snapshot diary rows on the connected tent only", () => {
    expect(
      countManualSnapshotQuickLogEvidence({
        tentId: TENT,
        diaryEntries: [
          {
            tent_id: TENT,
            details: { manual_sensor_snapshot: { source: "manual", temp_f: 72.4 } },
          },
          {
            tent_id: TENT,
            details: { manual_sensor_snapshot: { source: "manual", humidity_percent: 55 } },
          },
          // Different tent, missing tent, unlabeled source, no readings —
          // none of these prove sensor truth for the connected tent.
          {
            tent_id: "tent-b",
            details: { manual_sensor_snapshot: { source: "manual", temp_f: 70 } },
          },
          {
            tent_id: null,
            details: { manual_sensor_snapshot: { source: "manual", temp_f: 70 } },
          },
          { tent_id: TENT, details: { manual_sensor_snapshot: { temp_f: 70 } } },
          { tent_id: TENT, details: { manual_sensor_snapshot: { source: "manual" } } },
          { tent_id: TENT, details: {} },
          null,
        ],
      }),
    ).toBe(2);
  });

  it("counts manual, non-deleted environment grow_events on the connected tent", () => {
    expect(
      countManualSnapshotQuickLogEvidence({
        tentId: TENT,
        growEvents: [
          { tent_id: TENT, event_type: "environment", source: "manual", is_deleted: false },
          { tent_id: TENT, event_type: "environment", source: "manual", is_deleted: true },
          {
            tent_id: TENT,
            event_type: "environment",
            source: "manual",
            deleted_at: "2026-07-19T12:00:00Z",
          },
          { tent_id: TENT, event_type: "environment", source: "live" },
          { tent_id: TENT, event_type: "watering", source: "manual" },
          { tent_id: "tent-b", event_type: "environment", source: "manual" },
          null,
        ],
      }),
    ).toBe(1);
  });

  it("fails closed without a connected tent and on empty input", () => {
    expect(countManualSnapshotQuickLogEvidence(null)).toBe(0);
    expect(countManualSnapshotQuickLogEvidence({ tentId: null })).toBe(0);
    expect(
      countManualSnapshotQuickLogEvidence({
        tentId: "  ",
        growEvents: [{ tent_id: "  ", event_type: "environment", source: "manual" }],
      }),
    ).toBe(0);
  });
});

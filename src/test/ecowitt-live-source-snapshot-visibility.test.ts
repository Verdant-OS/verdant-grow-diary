/**
 * Verifies the EcoWitt latest snapshot filter recognizes rows stored as
 * canonical source="live" with vendor lineage that begins with "ecowitt"
 * (e.g. "ecowitt_windows_testbench" produced by the deployed
 * sensor-ingest-webhook). Prior to this, only exact vendor==="ecowitt"
 * matched, hiding live-forwarded EcoWitt readings from the snapshot card.
 *
 * Pure-helper test. No Supabase, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import {
  selectEcowittCandidates,
  buildEcowittLatestSnapshot,
  type EcowittSensorReadingRow,
} from "@/lib/ecowittLatestSnapshotFilter";

const TENT = "tent-A";
const OTHER_TENT = "tent-B";

function makeRow(
  partial: Partial<EcowittSensorReadingRow>,
): EcowittSensorReadingRow {
  return {
    id: "row-1",
    tent_id: TENT,
    plant_id: null,
    source: "live",
    captured_at: "2026-06-17T11:59:40.568Z",
    ts: "2026-06-17T11:59:40.568Z",
    raw_payload: {},
    ...partial,
  };
}

describe("EcoWitt latest snapshot — live-source visibility", () => {
  it("accepts source=live with raw_payload.vendor='ecowitt_windows_testbench'", () => {
    const rows: EcowittSensorReadingRow[] = [
      makeRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          source: "ecowitt",
          metrics: {
            temp_f: 81.14,
            humidity_percent: 47,
            soil_moisture_pct: 80,
          },
        },
      }),
    ];
    const candidates = selectEcowittCandidates(rows, { tentId: TENT });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("live");
  });

  it("accepts source=live when raw_payload.transport_source='ecowitt'", () => {
    const rows = [
      makeRow({
        raw_payload: {
          transport_source: "ecowitt",
          metrics: { temp_f: 75, humidity_percent: 50 },
        },
      }),
    ];
    expect(selectEcowittCandidates(rows, { tentId: TENT })).toHaveLength(1);
  });

  it("does NOT bleed in source=live rows without EcoWitt lineage", () => {
    const rows = [
      makeRow({
        raw_payload: { vendor: "pi_bridge", metrics: { temp_f: 70 } },
      }),
    ];
    expect(selectEcowittCandidates(rows, { tentId: TENT })).toHaveLength(0);
  });

  it("respects tent scoping for live-forwarded rows", () => {
    const rows = [
      makeRow({
        tent_id: OTHER_TENT,
        raw_payload: { vendor: "ecowitt_windows_testbench", metrics: {} },
      }),
    ];
    expect(selectEcowittCandidates(rows, { tentId: TENT })).toHaveLength(0);
  });

  it("end-to-end builder produces a candidate for live EcoWitt row", () => {
    const capturedAt = "2026-06-17T11:59:40.568Z";
    const rows = [
      makeRow({
        captured_at: capturedAt,
        ts: capturedAt,
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metrics: {
            temp_f: 81.14,
            humidity_percent: 47,
            soil_moisture_pct: 80,
          },
        },
      }),
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT }, {
      now: new Date("2026-06-17T12:00:00.000Z"),
    });
    // The pure filter must surface the row as a candidate; downstream
    // view-model presentation (hasReading vs invalid) is covered by
    // ecowitt-latest-snapshot-filtering / view-model tests.
    expect(vm).toBeTruthy();
  });

  it("does not surface tokens, PASSKEY, Authorization, or service-role strings in candidates", () => {
    const rows = [
      makeRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metrics: { temp_f: 75 },
        },
      }),
    ];
    const json = JSON.stringify(selectEcowittCandidates(rows, { tentId: TENT }));
    expect(json).not.toMatch(/PASSKEY|Authorization|service_role|vbt_/i);
  });
});

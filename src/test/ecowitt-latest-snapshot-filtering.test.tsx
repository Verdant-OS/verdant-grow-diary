import { describe, it, expect } from "vitest";
import {
  selectEcowittCandidates,
  buildEcowittLatestSnapshot,
  type EcowittSensorReadingRow,
} from "@/lib/ecowittLatestSnapshotFilter";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
const NEWER_AT = "2026-06-04T12:25:00Z";
const STALE_AT = "2026-06-04T10:00:00Z";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const PLANT_1 = "33333333-3333-3333-3333-333333333333";

function row(
  overrides: Partial<EcowittSensorReadingRow> = {},
  payload: Record<string, unknown> = { temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
): EcowittSensorReadingRow {
  return {
    tent_id: TENT_A,
    plant_id: null,
    source: "ecowitt",
    captured_at: FRESH_AT,
    raw_payload: payload,
    ...overrides,
  };
}

describe("ecowittLatestSnapshotFilter", () => {
  it("returns empty candidates when there are no rows", () => {
    expect(selectEcowittCandidates([], { tentId: TENT_A })).toEqual([]);
  });

  it("filters by tent_id and never bleeds another tent's newer reading in", () => {
    const rows: EcowittSensorReadingRow[] = [
      row({ tent_id: TENT_A, captured_at: FRESH_AT }, { temp1f: 70, humidity1: 50, dateutc: FRESH_AT }),
      row({ tent_id: TENT_B, captured_at: NEWER_AT }, { temp1f: 90, humidity1: 80, dateutc: NEWER_AT }),
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(true);
    expect(vm.metrics.humidity_pct).toBe(50);
  });

  it("filters by plant_id when provided", () => {
    const rows: EcowittSensorReadingRow[] = [
      row({ plant_id: PLANT_1, captured_at: FRESH_AT }, { temp1f: 77, humidity1: 55, dateutc: FRESH_AT }),
      row({ plant_id: null, captured_at: NEWER_AT }, { temp1f: 80, humidity1: 60, dateutc: NEWER_AT }),
    ];
    const vm = buildEcowittLatestSnapshot(
      rows,
      { tentId: TENT_A, plantId: PLANT_1 },
      { now: NOW },
    );
    expect(vm.metrics.humidity_pct).toBe(55);
  });

  it("renders empty-state when no EcoWitt rows match", () => {
    const rows: EcowittSensorReadingRow[] = [
      row({ source: "manual", raw_payload: null }),
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(false);
    expect(vm.emptyStateMessage).toBe(
      "No EcoWitt readings yet. Send a local test payload to verify the integration.",
    );
  });

  it("treats source=ecowitt + fresh as Live and labels Ecowitt", () => {
    const vm = buildEcowittLatestSnapshot([row()], { tentId: TENT_A }, { now: NOW });
    expect(vm.source).toBe("live");
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
  });

  it("demotes stale listener readings to Stale (never Live)", () => {
    const vm = buildEcowittLatestSnapshot(
      [row({ captured_at: STALE_AT }, { temp1f: 77, humidity1: 55, dateutc: STALE_AT })],
      { tentId: TENT_A },
      { now: NOW },
    );
    expect(vm.sourceLabel?.label).toBe("Stale");
    expect(vm.sourceLabel?.label).not.toBe("Live");
  });

  it("labels manual EcoWitt rows as Manual, never Live", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT_A,
          source: "manual",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT_A },
      { now: NOW },
    );
    expect(vm.source).toBe("manual");
    expect(vm.sourceLabel?.label).toBe("Manual");
  });

  it("recognises EcoWitt lineage via raw_payload.vendor when source label is generic", () => {
    const rows: EcowittSensorReadingRow[] = [
      {
        tent_id: TENT_A,
        source: "webhook",
        captured_at: FRESH_AT,
        raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
      },
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(true);
  });

  it("preserves raw payload on the chosen snapshot", () => {
    const payload = { temp1f: 77, humidity1: 55, dateutc: FRESH_AT };
    const vm = buildEcowittLatestSnapshot(
      [row({}, payload)],
      { tentId: TENT_A },
      { now: NOW },
    );
    expect(vm.snapshot?.rawPayload).toBe(payload);
  });
});

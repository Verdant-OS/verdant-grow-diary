import { describe, expect, it } from "vitest";
import {
  buildCsvImportPlan,
  type BuildCsvImportPlanInput,
  type OwnershipContext,
  type PreviewRowInput,
} from "@/lib/csvImportPlanRules";

const USER = "user-1";
const OWNERSHIP: OwnershipContext = {
  authenticated: true,
  userId: USER,
  grow: { id: "grow-1", ownerUserId: USER },
  tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
  plant: { id: "plant-1", tentId: "tent-1", growId: "grow-1", ownerUserId: USER },
};
const NOW = new Date("2026-06-04T12:00:00.000Z");

function inputOf(rows: PreviewRowInput[], overrides: Partial<BuildCsvImportPlanInput> = {}): BuildCsvImportPlanInput {
  return {
    filename: "export.csv",
    fileSizeBytes: 1024,
    totalRowCount: rows.length,
    source: "csv",
    columnMappingVersion: "v1",
    rows,
    ownership: OWNERSHIP,
    now: NOW,
    ...overrides,
  };
}

const cleanRow: PreviewRowInput = {
  rowIndex: 0,
  capturedAtRaw: "2026-06-01T10:00:00Z",
  metric: "temperature",
  value: 22.5,
  raw: { sensor_temp: "22.5", time: "2026-06-01T10:00:00Z" },
};

describe("sensor write draft shape", () => {
  it("accepted row matches the expected sensor draft shape", () => {
    const p = buildCsvImportPlan(inputOf([cleanRow]));
    const w = p.acceptedWrites[0];
    expect(w).toMatchObject({
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: null, // tent-scoped metric
      source: "csv",
      metric: "temperature",
      value: 22.5,
      captured_at: "2026-06-01T10:00:00.000Z",
      quality: "ok",
    });
    expect(typeof w.idempotency_key).toBe("string");
    expect(w.raw_payload.filename).toBe("export.csv");
    expect(w.raw_payload.row_index).toBe(0);
    expect(w.raw_payload.column_mapping_version).toBe("v1");
    expect(w.raw_payload.confidence).toBe(1.0);
    expect(typeof w.raw_payload.import_batch_id).toBe("string");
  });

  it("source is csv or tsv, never live", () => {
    const csv = buildCsvImportPlan(inputOf([cleanRow]));
    const tsv = buildCsvImportPlan(inputOf([cleanRow], { source: "tsv" }));
    expect(csv.acceptedWrites[0].source).toBe("csv");
    expect(tsv.acceptedWrites[0].source).toBe("tsv");
    const json = JSON.stringify([csv, tsv]);
    expect(json).not.toMatch(/"source":"live"/);
  });

  it("quality=ok only when zero flags", () => {
    const p = buildCsvImportPlan(inputOf([cleanRow]));
    expect(p.acceptedWrites[0].quality).toBe("ok");
    expect(p.acceptedWrites[0].raw_payload.confidence).toBe(1.0);
  });

  it("quality=suspect, confidence=0.6 only for soft flags", () => {
    const p = buildCsvImportPlan(
      inputOf([{ ...cleanRow, softFlags: ["mild_drift"] }]),
    );
    expect(p.acceptedWrites[0].quality).toBe("suspect");
    expect(p.acceptedWrites[0].raw_payload.confidence).toBe(0.6);
  });

  it("hard-flagged rows never appear in accepted writes", () => {
    const rows: PreviewRowInput[] = Array.from({ length: 50 }, (_, i) => ({
      ...cleanRow,
      rowIndex: i,
      capturedAtRaw: `2026-06-01T10:${String(i).padStart(2, "0")}:00Z`,
    }));
    // 1 hard-flagged out of 50 (2%) stays under the batch threshold
    rows[0] = { ...rows[0], metric: "ph", value: 99, hardFlags: ["ph_out_of_range"] };
    const p = buildCsvImportPlan(inputOf(rows));
    expect(p.ok).toBe(true);
    expect(p.acceptedWrites.find((w) => w.metric === "ph" && w.value === 99)).toBeUndefined();
    expect(p.blockedRows.find((b) => b.rowIndex === 0)).toBeDefined();
  });

  it("raw_payload strips tokens/auth/user_id and device-control fields", () => {
    const p = buildCsvImportPlan(
      inputOf([
        {
          ...cleanRow,
          raw: {
            sensor_temp: "22.5",
            api_key: "leak",
            bearer_token: "leak",
            user_id: "leak",
            service_role: "leak",
            pump_relay: "ON",
            fan_command: "1",
            normal_field: "ok",
          },
        },
      ]),
    );
    const raw = p.acceptedWrites[0].raw_payload.row;
    expect(raw.normal_field).toBe("ok");
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/api_key|bearer|user_id|service_role|pump_relay|fan_command/);
  });
});

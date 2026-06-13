/**
 * Tests for buildVerdantGeneticsXlsxInsertRows — pure adapter from
 * verdantGeneticsXlsxParser preview rows to sensor_readings insert rows.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVerdantGeneticsXlsxInsertRows,
} from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import {
  parseVerdantGeneticsXlsx,
  type CellGrid,
  type VerdantGeneticsParseResult,
  type VerdantGeneticsPreviewMetricRow,
} from "@/lib/verdantGeneticsXlsxParser";

function makeGrid(): CellGrid {
  return [
    ["", "Flower Tent", "Flower Tent", "Flower Tent", "Seedling Tent", "Seedling Tent", "Veg Tent"],
    ["timestamp", "temp_f", "humidity", "battery", "temp_c", "humidity", "soil_moisture"],
    ["2026-06-04T00:00:00Z", "75.2", "55", "3.7", "22", "60", "40"],
    ["2026-06-04T01:00:00Z", "76.0", "57", "3.7", "22.5", "62", "41"],
    ["2026-06-04T02:00:00Z", "77.0", "100", "3.6", "23", "0", "100"],
  ];
}

function preview(): VerdantGeneticsParseResult {
  return parseVerdantGeneticsXlsx(makeGrid());
}

const importBatchId = "batch-abc";
const tentMap = {
  "Flower Tent": "tent-flower-uuid",
  "Seedling Tent": "tent-seedling-uuid",
  "Veg Tent": "tent-veg-uuid",
};

describe("buildVerdantGeneticsXlsxInsertRows", () => {
  it("converts Flower Tent preview rows into sensor_readings inserts with mapped tent id", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    expect(res.blocked).toBe(false);
    const flower = res.rows.filter((r) => r.tent_id === "tent-flower-uuid");
    expect(flower.length).toBeGreaterThan(0);
    expect(flower.every((r) => r.raw_payload.sensor_group === "Flower Tent")).toBe(true);
  });

  it("emits source='csv' and quality='ok' on every row", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    expect(res.rows.every((r) => r.source === "csv")).toBe(true);
    expect(res.rows.every((r) => r.quality === "ok")).toBe(true);
  });

  it("emits raw_payload.source_app and csv_import=true", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    expect(res.rows.every((r) => r.raw_payload.source_app === "verdant_genetics_xlsx")).toBe(true);
    expect(res.rows.every((r) => r.raw_payload.csv_import === true)).toBe(true);
  });

  it("preserves sensor_group, original_metric_label, original_value, original_unit, import_batch_id", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    const tempRow = res.rows.find(
      (r) => r.metric === "temperature_c" && r.raw_payload.sensor_group === "Flower Tent",
    );
    expect(tempRow).toBeDefined();
    expect(tempRow!.raw_payload.original_metric_label).toBe("temp_f");
    expect(tempRow!.raw_payload.original_value).toBe(75.2);
    expect(tempRow!.raw_payload.original_unit).toBe("F");
    expect(tempRow!.raw_payload.import_batch_id).toBe(importBatchId);
  });

  it("preserves grow_id when provided", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      growId: "grow-xyz",
      preview: preview(),
    });
    expect(res.rows.every((r) => r.raw_payload.grow_id === "grow-xyz")).toBe(true);
  });

  it("omits grow_id when not provided", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    expect(res.rows.every((r) => r.raw_payload.grow_id === undefined)).toBe(true);
  });

  it("preserves calculated VPD marker in raw payload", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    const vpd = res.rows.find((r) => r.metric === "vpd_kpa");
    expect(vpd).toBeDefined();
    expect(vpd!.raw_payload.calculated).toBe(true);
  });

  it("preserves AD/battery extras when present", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    const withExtras = res.rows.find(
      (r) =>
        r.raw_payload.sensor_group === "Flower Tent" &&
        r.raw_payload.extras &&
        "battery" in r.raw_payload.extras,
    );
    expect(withExtras).toBeDefined();
    expect(withExtras!.raw_payload.extras!.battery).toBe(3.7);
  });

  it("attaches suspicious flags for matching group/timestamp/metric", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    const stuckHigh = res.rows.find(
      (r) =>
        r.raw_payload.sensor_group === "Flower Tent" &&
        r.metric === "humidity_pct" &&
        r.value === 100,
    );
    expect(stuckHigh).toBeDefined();
    expect(stuckHigh!.raw_payload.suspicious_flags?.[0].kind).toBe("humidity_stuck_full");
  });

  it("rejects sensor groups missing a tent mapping", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: { "Flower Tent": "tent-flower-uuid" },
      importBatchId,
      preview: preview(),
    });
    expect(res.rejectionReasons.missing_tent_mapping).toBeGreaterThan(0);
    expect(res.rows.every((r) => r.tent_id === "tent-flower-uuid")).toBe(true);
  });

  it("returns blocked result when preview has no rows", () => {
    const empty: VerdantGeneticsParseResult = {
      rows: [],
      suspicious: [],
      rejected: [],
      summary: {
        detected_groups: [],
        reading_group_count: 0,
        date_range: null,
        mapped_metric_count: 0,
        rejected_metric_count: 0,
        suspicious_count: 0,
        recommended_source: "csv",
        source_app: "verdant_genetics_xlsx",
      },
    };
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: empty,
    });
    expect(res.blocked).toBe(true);
    expect(res.blockedReason).toBe("no_readable_sensor_rows");
    expect(res.rows).toEqual([]);
  });

  it("returns blocked result when all rows lack tent mapping", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: {},
      importBatchId,
      preview: preview(),
    });
    expect(res.blocked).toBe(true);
    expect(res.blockedReason).toBe("missing_tent_mapping");
    expect(res.rows).toEqual([]);
    expect(res.rejectionReasons.missing_tent_mapping).toBeGreaterThan(0);
  });

  it("does not emit unsupported metrics", () => {
    const p = preview();
    // Inject an unsupported metric row.
    const tainted: VerdantGeneticsParseResult = {
      ...p,
      rows: [
        ...p.rows,
        {
          captured_at: "2026-06-04T00:00:00Z",
          sensor_group: "Flower Tent",
          metric: "co2_ppm" as unknown as VerdantGeneticsPreviewMetricRow["metric"],
          value: 800,
          calculated: false,
          source: "csv",
          raw_payload: {
            csv_import: true,
            source_app: "verdant_genetics_xlsx",
            sensor_group: "Flower Tent",
            original_metric_label: "co2",
            original_value: 800,
            original_unit: null,
          },
        },
      ],
    };
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: tainted,
    });
    expect(res.rows.some((r) => (r.metric as string) === "co2_ppm")).toBe(false);
    expect(res.rejectionReasons.unsupported_metric).toBe(1);
  });

  it("does not emit null/NaN/non-numeric values", () => {
    const p = preview();
    const tainted: VerdantGeneticsParseResult = {
      ...p,
      rows: [
        ...p.rows,
        {
          captured_at: "2026-06-04T00:00:00Z",
          sensor_group: "Flower Tent",
          metric: "temperature_c",
          value: NaN,
          calculated: false,
          source: "csv",
          raw_payload: {
            csv_import: true,
            source_app: "verdant_genetics_xlsx",
            sensor_group: "Flower Tent",
            original_metric_label: "temp_f",
            original_value: null,
            original_unit: "F",
          },
        },
      ],
    };
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: tainted,
    });
    expect(res.rows.every((r) => Number.isFinite(r.value))).toBe(true);
    expect(res.rejectionReasons.non_numeric_value).toBe(1);
  });

  it("does not classify rows as live", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    expect(res.rows.every((r) => (r.source as string) !== "live")).toBe(true);
  });

  it("handles multiple sensor groups mapped to different tent IDs", () => {
    const res = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: tentMap,
      importBatchId,
      preview: preview(),
    });
    const tents = new Set(res.rows.map((r) => r.tent_id));
    expect(tents.size).toBeGreaterThanOrEqual(3);
    expect(tents.has("tent-flower-uuid")).toBe(true);
    expect(tents.has("tent-seedling-uuid")).toBe(true);
    expect(tents.has("tent-veg-uuid")).toBe(true);
  });

  it("rejection reason counts are deterministic across runs", () => {
    const a = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: { "Flower Tent": "tent-flower-uuid" },
      importBatchId,
      preview: preview(),
    });
    const b = buildVerdantGeneticsXlsxInsertRows({
      tentIdBySensorGroup: { "Flower Tent": "tent-flower-uuid" },
      importBatchId,
      preview: preview(),
    });
    expect(a.rejectionReasons).toEqual(b.rejectionReasons);
    expect(a.acceptedRowCount).toBe(b.acceptedRowCount);
    expect(a.rejectedRowCount).toBe(b.rejectedRowCount);
  });

  it("static safety guard: adapter source has no forbidden references", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/verdantGeneticsXlsxInsertRowsAdapter.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/alerts?/i);
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/openai|anthropic|llm|model_call/i);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge_token/);
    expect(src).not.toMatch(/device_command|device_control/);
  });
});

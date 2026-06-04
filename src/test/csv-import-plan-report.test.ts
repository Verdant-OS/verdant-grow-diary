import { describe, expect, it } from "vitest";
import {
  buildCsvImportPlanReport,
  buildSensorDraftSample,
  CSV_IMPORT_PLAN_REPORT_VERSION,
  CSV_IMPORT_PLAN_STATUS_LABEL,
  groupBlockedRowsByReason,
  serializeCsvImportPlanReport,
} from "@/lib/csvImportPlanReport";
import {
  buildCsvImportPlan,
  type BuildCsvImportPlanInput,
  type OwnershipContext,
  type PreviewRowInput,
} from "@/lib/csvImportPlanRules";

const USER = "user-1";
const OWN: OwnershipContext = {
  authenticated: true,
  userId: USER,
  grow: { id: "grow-1", ownerUserId: USER },
  tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
  plant: { id: "plant-1", tentId: "tent-1", growId: "grow-1", ownerUserId: USER },
};
const NOW = new Date("2026-06-04T12:00:00.000Z");

function mkInput(rows: PreviewRowInput[], o: Partial<BuildCsvImportPlanInput> = {}): BuildCsvImportPlanInput {
  return {
    filename: "export.csv",
    fileSizeBytes: 1024,
    totalRowCount: rows.length,
    source: "csv",
    columnMappingVersion: "v1",
    rows,
    ownership: OWN,
    now: NOW,
    ...o,
  };
}

const rowAt = (i: number, metric = "temperature", value = 22 + i): PreviewRowInput => ({
  rowIndex: i,
  capturedAtRaw: `2026-06-01T10:${String(i).padStart(2, "0")}:00Z`,
  metric,
  value,
});

describe("csvImportPlanReport — report builder", () => {
  it("includes report_version, status, generated_at, filename, source", () => {
    const plan = buildCsvImportPlan(mkInput([rowAt(0), rowAt(1, "humidity", 55)]));
    const report = buildCsvImportPlanReport(
      plan,
      { fileName: "export.csv", sourceType: "csv" },
      { generatedAt: NOW.toISOString() },
    );
    expect(report.reportVersion).toBe(CSV_IMPORT_PLAN_REPORT_VERSION);
    expect(report.reportVersion).toBe("csv_import_plan_v1");
    expect(report.statusLabel).toBe(CSV_IMPORT_PLAN_STATUS_LABEL);
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.fileName).toBe("export.csv");
    expect(report.sourceType).toBe("csv");
  });

  it("counts, date range, metric breakdown, diary draft, sensor sample are present", () => {
    const rows = [rowAt(0), rowAt(1, "humidity", 55), rowAt(2, "vpd", 1.1)];
    const plan = buildCsvImportPlan(mkInput(rows));
    const report = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    expect(report.counts.accepted).toBe(3);
    expect(report.counts.blocked).toBe(0);
    expect(report.counts.duplicateSkipped).toBe(0);
    expect(report.counts.rowCount).toBe(3);
    expect(report.dateRange.start).toBe("2026-06-01T10:00:00.000Z");
    expect(report.metricBreakdown).toEqual({ temperature: 1, humidity: 1, vpd: 1 });
    expect(report.diarySummaryDraft).not.toBeNull();
    expect(report.sensorWriteDraftSample.length).toBe(3);
    expect(report.sensorWriteDraftSample[0].source).toBe("csv");
    expect(report.sensorWriteDraftSample[0].quality).toBe("ok");
    expect(typeof report.sensorWriteDraftSample[0].confidence).toBe("number");
  });

  it("sample sensor drafts are capped at 10", () => {
    const rows = Array.from({ length: 25 }, (_, i) => rowAt(i));
    const plan = buildCsvImportPlan(mkInput(rows, { totalRowCount: 25 }));
    const report = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    expect(report.sensorWriteDraftSample.length).toBe(10);
  });

  it("blocked reason groups carry plain-language explanations + suggested fix", () => {
    const rows: PreviewRowInput[] = [
      { rowIndex: 0, capturedAtRaw: "not-a-date", metric: "temperature", value: 22.0 },
      { rowIndex: 1, capturedAtRaw: "2010-01-01T00:00:00Z", metric: "temperature", value: 22.0 },
    ];
    const plan = buildCsvImportPlan(mkInput(rows));
    const groups = groupBlockedRowsByReason(plan.blockedRows);
    const unparseable = groups.find((g) => g.reason === "unparseable_captured_at");
    expect(unparseable).toBeDefined();
    expect(unparseable!.explanation).toMatch(/timestamp/i);
    expect(unparseable!.fix).toMatch(/ISO-8601/);
    const old = groups.find((g) => g.reason === "captured_at_before_2020");
    expect(old).toBeDefined();
    expect(old!.fix).toMatch(/timezone|re-export/i);
  });

  it("blocked sample per reason group is capped at 3", () => {
    const rows: PreviewRowInput[] = Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      capturedAtRaw: "not-a-date",
      metric: "temperature",
      value: 22.0,
    }));
    const plan = buildCsvImportPlan(mkInput(rows));
    const groups = groupBlockedRowsByReason(plan.blockedRows);
    const g = groups.find((x) => x.reason === "unparseable_captured_at")!;
    expect(g.count).toBe(10);
    expect(g.samples.length).toBe(3);
  });

  it("duplicate info exposes count and key prefixes only (not full keys)", () => {
    const rows = [rowAt(0)];
    const first = buildCsvImportPlan(mkInput(rows));
    const keys = new Set(first.acceptedWrites.map((w) => w.idempotency_key));
    const second = buildCsvImportPlan(mkInput(rows, { existingIdempotencyKeys: keys }));
    const report = buildCsvImportPlanReport(second, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    expect(report.duplicateInfo.count).toBe(1);
    expect(report.duplicateInfo.keyPrefixes[0].length).toBeLessThanOrEqual(16);
    // Full key must not appear in serialised JSON
    const fullKey = [...keys][0];
    const json = serializeCsvImportPlanReport(report);
    expect(json).not.toContain(fullKey);
  });

  it("safety note is present and lists no-save / no-automation / no-device-control", () => {
    const plan = buildCsvImportPlan(mkInput([rowAt(0)]));
    const report = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    const joined = report.safetyNote.join(" ");
    expect(joined).toMatch(/No save/);
    expect(joined).toMatch(/No automation/);
    expect(joined).toMatch(/No device control/);
    expect(joined).toMatch(/No alerts/);
    expect(joined).toMatch(/No Action Queue/);
  });

  it("serialised JSON omits secrets/tokens/user_id/internal IDs/service role", () => {
    const rows: PreviewRowInput[] = [
      {
        rowIndex: 0,
        capturedAtRaw: "2026-06-01T10:00:00Z",
        metric: "temperature",
        value: 22.5,
        raw: {
          sensor_temp: "22.5",
          api_key: "leak1",
          bearer_token: "leak2",
          user_id: "leak3",
          service_role: "leak4",
          normal_field: "ok",
        },
      },
    ];
    const plan = buildCsvImportPlan(mkInput(rows));
    const report = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    const json = serializeCsvImportPlanReport(report);
    expect(json).not.toMatch(/leak1|leak2|leak3|leak4/);
    expect(json).not.toMatch(/service_role/i);
    expect(json).not.toMatch(/bearer/i);
    // Report does NOT echo full raw sensor rows by default
    expect(json).not.toContain("sensor_temp");
  });

  it("buildSensorDraftSample respects custom limit and exposes prefix-only idempotency keys", () => {
    const rows = Array.from({ length: 8 }, (_, i) => rowAt(i));
    const plan = buildCsvImportPlan(mkInput(rows));
    const sample = buildSensorDraftSample(plan.acceptedWrites, 3);
    expect(sample.length).toBe(3);
    expect(sample[0].idempotency_key_prefix.length).toBeLessThanOrEqual(16);
  });

  it("generatedAt is deterministic when injected", () => {
    const plan = buildCsvImportPlan(mkInput([rowAt(0)]));
    const a = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    const b = buildCsvImportPlanReport(plan, { fileName: "a.csv", sourceType: "csv" }, { generatedAt: NOW.toISOString() });
    expect(a.generatedAt).toBe(b.generatedAt);
    expect(serializeCsvImportPlanReport(a)).toBe(serializeCsvImportPlanReport(b));
  });
});

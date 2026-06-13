import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_DOCTOR_CSV_HISTORY_LABEL,
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  buildAiDoctorCsvHistoryContext,
} from "@/lib/aiDoctorCsvHistoryContextRules";

const baseRow = (over: Record<string, unknown> = {}) => ({
  metric: "temperature_c",
  value: 24,
  unit: "C",
  captured_at: "2026-06-01T12:00:00Z",
  source: "csv",
  ...over,
});

describe("aiDoctorCsvHistoryContextRules", () => {
  it("returns empty when no CSV rows", () => {
    const ctx = buildAiDoctorCsvHistoryContext({ rows: [] });
    expect(ctx.hasCsvHistory).toBe(false);
    expect(ctx.totalReadings).toBe(0);
    expect(ctx.dateRange).toBeNull();
    expect(ctx.vendors).toEqual([]);
    expect(ctx.metrics).toEqual([]);
  });

  it("ignores non-CSV rows (does not promote live to history)", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow({ source: "live" }), baseRow({ source: "manual" })],
    });
    expect(ctx.hasCsvHistory).toBe(false);
  });

  it("labels Spider Farmer vendor lineage", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [
        baseRow({
          raw_payload: { source_app: "spider_farmer", csv_import: true },
        }),
      ],
    });
    expect(ctx.vendors.map((v) => v.vendorLabel)).toContain("Spider Farmer");
  });

  it("labels Vivosun vendor lineage", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow({ raw_payload: { source_app: "vivosun" } })],
    });
    expect(ctx.vendors.map((v) => v.vendorLabel)).toContain("Vivosun");
  });

  it("labels AC Infinity vendor lineage", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow({ raw_payload: { source_app: "ac_infinity" } })],
    });
    expect(ctx.vendors.map((v) => v.vendorLabel)).toContain("AC Infinity");
  });

  it("labels Verdant Genetics XLSX source app as safe label", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow({ raw_payload: { source_app: "verdant_genetics_xlsx" } })],
    });
    expect(ctx.vendors[0]?.vendorLabel).toBe("Verdant Genetics XLSX");
  });

  it("summarizes date range and metric min/max/avg/count", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [
        baseRow({ captured_at: "2026-06-01T00:00:00Z", value: 20 }),
        baseRow({ captured_at: "2026-06-03T00:00:00Z", value: 30 }),
        baseRow({ captured_at: "2026-06-02T00:00:00Z", value: 25 }),
      ],
    });
    expect(ctx.hasCsvHistory).toBe(true);
    expect(ctx.totalReadings).toBe(3);
    expect(ctx.dateRange).toEqual({
      earliest: "2026-06-01T00:00:00Z",
      latest: "2026-06-03T00:00:00Z",
    });
    const m = ctx.metrics[0];
    expect(m.metric).toBe("temperature_c");
    expect(m.count).toBe(3);
    expect(m.min).toBe(20);
    expect(m.max).toBe(30);
    expect(m.avg).toBe(25);
  });

  it("uses constant historical label and not-live caveat", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow()],
    });
    expect(ctx.historicalLabel).toBe("CSV history");
    expect(AI_DOCTOR_CSV_HISTORY_LABEL).toBe("CSV history");
    expect(ctx.notForLiveDiagnosis).toBe(AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE);
    expect(ctx.notForLiveDiagnosis.toLowerCase()).toContain("not live");
  });

  it("counts suspicious flags when present", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [
        baseRow({ raw_payload: { suspicious_flags: ["stuck_humidity"] } }),
        baseRow({ raw_payload: { suspicious: true } }),
        baseRow(),
      ],
    });
    expect(ctx.suspiciousFlagCount).toBe(2);
  });

  it("never includes raw payload internals or internal IDs", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [
        baseRow({
          raw_payload: {
            source_app: "spider_farmer",
            device_serial: "SF-XXX-123",
            bridge_token: "tok_secret",
            source_file: "/users/me/export.csv",
            raw_row: { hidden: "stuff" },
            internal_id: "row-42",
          },
        }),
      ],
    });
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("SF-XXX-123");
    expect(json).not.toContain("tok_secret");
    expect(json).not.toContain("export.csv");
    expect(json).not.toContain("raw_row");
    expect(json).not.toContain("row-42");
    expect(json).not.toContain("device_serial");
    expect(json).not.toContain("bridge_token");
  });

  it("does not surface CSV rows as current/live telemetry", () => {
    const ctx = buildAiDoctorCsvHistoryContext({
      rows: [baseRow()],
    });
    const json = JSON.stringify(ctx).toLowerCase();
    expect(json).not.toContain('"source":"live"');
    expect(json).not.toContain('"live"');
    expect(json).not.toContain("current_reading");
    expect(ctx.historicalLabel).toBe("CSV history");
  });

  it("source module makes no Supabase or write calls and no alerts/action queue", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/aiDoctorCsvHistoryContextRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bfrom\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/\balerts?\b\s*[:.]/i);
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/createClient/);
  });
});

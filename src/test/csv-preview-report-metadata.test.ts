import { describe, it, expect } from "vitest";
import {
  buildCsvPreview,
  buildCsvPreviewReport,
  buildCsvPreviewSummaryCsv,
  CSV_PREVIEW_REPORT_VERSION,
  CSV_PREVIEW_STATUS_LABEL,
  parseDelimitedSensorPreview,
} from "@/lib/csvSensorPreviewRules";

const CSV =
  "timestamp,temperature,humidity\n2026-06-01T10:00,24.1,100\n2026-06-01T11:00,24.5,100\n";

const TSV =
  "timestamp\ttemperature\tlux\n2026-06-01T10:00\t24.1\t20000\n";

const FIXED_NOW = "2026-06-04T12:00:00.000Z";

describe("CSV preview report metadata", () => {
  it("includes report_version, source_type, generated_at, status, filename", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const report = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    expect(report.reportVersion).toBe(CSV_PREVIEW_REPORT_VERSION);
    expect(report.reportVersion).toBe("csv_preview_v1");
    expect(report.generatedAt).toBe(FIXED_NOW);
    expect(report.fileName).toBe("ecowitt.csv");
    expect(report.sourceType).toBe("csv");
    expect(report.statusLabel).toBe(CSV_PREVIEW_STATUS_LABEL);
  });

  it("source_type is tsv for tab-delimited input", () => {
    const preview = parseDelimitedSensorPreview(TSV, { fileName: "ha.tsv" });
    const report = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    expect(report.sourceType).toBe("tsv");
    expect(report.fileName).toBe("ha.tsv");
  });

  it("does not include auth/token/user/internal-id fields", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const report = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/\buser_id\b/i);
    expect(json).not.toMatch(/\bauth(orization)?\b/i);
    expect(json).not.toMatch(/\btoken\b/i);
    expect(json).not.toMatch(/\bbridge[_-]?token\b/i);
    expect(json).not.toMatch(/\bservice_role\b/i);
    expect(json).not.toMatch(/\binternal_id\b/i);
    expect(json).not.toMatch(/\bsecret\b/i);
  });

  it("does not include raw full sensor rows by default", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const report = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    expect((report as unknown as { rows?: unknown }).rows).toBeUndefined();
    expect((report as unknown as { sampleRows?: unknown }).sampleRows).toBeUndefined();
  });

  it("generated timestamp is deterministic when injected", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const a = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    const b = buildCsvPreviewReport(preview, { generatedAt: FIXED_NOW });
    expect(a.generatedAt).toBe(b.generatedAt);
  });
});

describe("buildCsvPreviewSummaryCsv", () => {
  it("includes metadata header rows for report_version, generated_at, file_name, source_type, status", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const csv = buildCsvPreviewSummaryCsv(preview, { generatedAt: FIXED_NOW });
    expect(csv).toMatch(/# report_version,csv_preview_v1/);
    expect(csv).toMatch(new RegExp(`# generated_at,${FIXED_NOW}`));
    expect(csv).toMatch(/# file_name,ecowitt\.csv/);
    expect(csv).toMatch(/# source_type,csv/);
    expect(csv).toMatch(/# status,"?Preview only/);
  });

  it("source_type is tsv for tab input", () => {
    const preview = parseDelimitedSensorPreview(TSV, { fileName: "ha.tsv" });
    const csv = buildCsvPreviewSummaryCsv(preview, { generatedAt: FIXED_NOW });
    expect(csv).toMatch(/# source_type,tsv/);
  });

  it("does not include raw sensor row values", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const csv = buildCsvPreviewSummaryCsv(preview, { generatedAt: FIXED_NOW });
    expect(csv).not.toContain("2026-06-01T10:00");
    expect(csv).not.toContain("24.1");
  });

  it("does not leak auth/token/user fields", () => {
    const preview = buildCsvPreview(CSV, "ecowitt.csv");
    const csv = buildCsvPreviewSummaryCsv(preview, { generatedAt: FIXED_NOW });
    expect(csv).not.toMatch(/\btoken\b/i);
    expect(csv).not.toMatch(/\bsecret\b/i);
    expect(csv).not.toMatch(/\buser_id\b/i);
    expect(csv).not.toMatch(/\bservice_role\b/i);
  });
});

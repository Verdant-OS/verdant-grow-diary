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

function input(rows: PreviewRowInput[], o: Partial<BuildCsvImportPlanInput> = {}): BuildCsvImportPlanInput {
  return {
    filename: "export.csv",
    fileSizeBytes: 1024,
    totalRowCount: rows.length,
    source: "csv",
    columnMappingVersion: "v1",
    rows,
    ownership: OWNERSHIP,
    now: NOW,
    ...o,
  };
}

const mkRow = (i: number, metric = "temperature", value = 22 + i): PreviewRowInput => ({
  rowIndex: i,
  capturedAtRaw: `2026-06-01T10:${String(i).padStart(2, "0")}:00Z`,
  metric,
  value,
});

describe("diary summary draft", () => {
  it("produces exactly one summary draft per accepted batch", () => {
    const rows = [mkRow(0), mkRow(1, "humidity", 55), mkRow(2, "vpd", 1.1)];
    const p = buildCsvImportPlan(input(rows));
    expect(p.diarySummaryDraft).not.toBeNull();
    expect(p.diarySummaryDraft?.kind).toBe("csv_import_summary");
    expect(p.acceptedWrites.length).toBe(3);
  });

  it("does NOT create one diary entry per row", () => {
    const rows = Array.from({ length: 10 }, (_, i) => mkRow(i));
    const p = buildCsvImportPlan(input(rows));
    // Plan is the gatekeeper — only a single summary draft is ever returned.
    expect(Array.isArray(p.diarySummaryDraft)).toBe(false);
    expect(p.diarySummaryDraft).toBeTruthy();
  });

  it("summary includes import_batch_id, counts, metric breakdown, and date range", () => {
    const rows = [mkRow(0), mkRow(1, "humidity", 55)];
    const p = buildCsvImportPlan(input(rows));
    const d = p.diarySummaryDraft!.details;
    expect(d.import_batch_id).toBe(p.importBatchId);
    expect(d.accepted_count).toBe(2);
    expect(d.blocked_count).toBe(0);
    expect(d.duplicate_skipped_count).toBe(0);
    expect(d.metric_breakdown).toEqual({ temperature: 1, humidity: 1 });
    expect(d.date_range.start).toBe("2026-06-01T10:00:00.000Z");
    expect(d.date_range.end).toBe("2026-06-01T10:01:00.000Z");
    expect(d.filename).toBe("export.csv");
    expect(d.source).toBe("csv");
  });

  it("all-duplicate batch suppresses diary summary", () => {
    const rows = [mkRow(0)];
    const first = buildCsvImportPlan(input(rows));
    const keys = new Set(first.acceptedWrites.map((w) => w.idempotency_key));
    const second = buildCsvImportPlan(input(rows, { existingIdempotencyKeys: keys }));
    expect(second.duplicateSkipped.length).toBe(1);
    expect(second.acceptedWrites).toEqual([]);
    expect(second.diarySummaryDraft).toBeNull();
  });
});

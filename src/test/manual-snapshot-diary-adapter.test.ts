/**
 * manualSnapshotDiaryAdapter — pure adapter behavior.
 */
import { describe, it, expect } from "vitest";

import {
  diaryRowToManualSnapshotRecord,
  diaryRowsToManualSnapshotRecords,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";

function row(overrides: Partial<ManualSnapshotDiaryRow> = {}): ManualSnapshotDiaryRow {
  return {
    id: "row-1",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-01T10:00:00.000Z",
    note: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 75,
        humidity_percent: 55,
        ph: 6.1,
        ec: 1.4,
      },
    },
    ...overrides,
  };
}

describe("diaryRowToManualSnapshotRecord", () => {
  it("converts a manual snapshot row into a record with metrics", () => {
    const rec = diaryRowToManualSnapshotRecord(row());
    expect(rec).not.toBeNull();
    expect(rec!.tentId).toBe("tent-1");
    expect(rec!.plantId).toBe("plant-1");
    expect(rec!.validation.source).toBe("manual");
    expect(rec!.validation.metrics.length).toBeGreaterThan(0);
  });

  it("returns null for non-manual sources", () => {
    expect(
      diaryRowToManualSnapshotRecord(
        row({
          details: { manual_sensor_snapshot: { source: "live", temp_f: 75 } },
        }),
      ),
    ).toBeNull();
    expect(
      diaryRowToManualSnapshotRecord(
        row({
          details: { manual_sensor_snapshot: { source: "demo", temp_f: 75 } },
        }),
      ),
    ).toBeNull();
  });

  it("returns null when no manual_sensor_snapshot payload is present", () => {
    expect(
      diaryRowToManualSnapshotRecord(row({ details: { event_type: "note" } })),
    ).toBeNull();
    expect(diaryRowToManualSnapshotRecord(row({ details: null }))).toBeNull();
  });

  it("returns null without a tent_id (cannot scope safely)", () => {
    expect(diaryRowToManualSnapshotRecord(row({ tent_id: null }))).toBeNull();
  });

  it("returns null when entry_at is missing or invalid", () => {
    expect(diaryRowToManualSnapshotRecord(row({ entry_at: "" }))).toBeNull();
    expect(diaryRowToManualSnapshotRecord(row({ entry_at: "not-a-date" }))).toBeNull();
  });

  it("flags suspicious pH as a warning, never as healthy", () => {
    const rec = diaryRowToManualSnapshotRecord(
      row({
        details: {
          manual_sensor_snapshot: {
            source: "manual",
            temp_f: 75,
            humidity_percent: 55,
            ph: 9.5,
          },
        },
      }),
    );
    expect(rec).not.toBeNull();
    expect(rec!.validation.warnings.length).toBeGreaterThan(0);
  });
});

describe("diaryRowsToManualSnapshotRecords", () => {
  it("skips non-manual rows and preserves order", () => {
    const rows: ManualSnapshotDiaryRow[] = [
      row({ id: "a" }),
      row({
        id: "b",
        details: { manual_sensor_snapshot: { source: "live", temp_f: 70 } },
      }),
      row({ id: "c" }),
    ];
    const out = diaryRowsToManualSnapshotRecords(rows);
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });
});

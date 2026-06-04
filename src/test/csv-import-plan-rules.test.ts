import { describe, expect, it } from "vitest";
import {
  buildCsvImportPlan,
  type BuildCsvImportPlanInput,
  type OwnershipContext,
  type PreviewRowInput,
  MAX_FILE_BYTES,
  MAX_ROWS,
} from "@/lib/csvImportPlanRules";

const USER = "user-1";
const OWNERSHIP_OK: OwnershipContext = {
  authenticated: true,
  userId: USER,
  grow: { id: "grow-1", ownerUserId: USER },
  tent: { id: "tent-1", growId: "grow-1", ownerUserId: USER },
  plant: { id: "plant-1", tentId: "tent-1", growId: "grow-1", ownerUserId: USER },
};

const NOW = new Date("2026-06-04T12:00:00.000Z");

function base(overrides: Partial<BuildCsvImportPlanInput> = {}): BuildCsvImportPlanInput {
  return {
    filename: "ecowitt-export.csv",
    fileSizeBytes: 1024,
    totalRowCount: 0,
    source: "csv",
    columnMappingVersion: "v1",
    rows: [],
    ownership: OWNERSHIP_OK,
    now: NOW,
    ...overrides,
  };
}

function row(o: Partial<PreviewRowInput> & Pick<PreviewRowInput, "rowIndex">): PreviewRowInput {
  return {
    capturedAtRaw: "2026-06-01T10:00:00Z",
    metric: "temperature",
    value: 22.5,
    ...o,
  };
}

describe("buildCsvImportPlan — file-level hard blocks", () => {
  it("blocks empty file", () => {
    const p = buildCsvImportPlan(base({ totalRowCount: 0, rows: [] }));
    expect(p.ok).toBe(false);
    expect(p.hardBlockReasons).toContain("empty_file");
    expect(p.acceptedWrites).toEqual([]);
    expect(p.diarySummaryDraft).toBeNull();
  });

  it("blocks header-only file (rows[] empty but totalRowCount>0)", () => {
    const p = buildCsvImportPlan(base({ totalRowCount: 3, rows: [] }));
    expect(p.ok).toBe(false);
    expect(p.hardBlockReasons).toContain("header_only");
  });

  it("blocks demo fixture filename", () => {
    const p = buildCsvImportPlan(
      base({
        filename: "sample-sensor-export-ecowitt.csv",
        totalRowCount: 1,
        rows: [row({ rowIndex: 0 })],
      }),
    );
    expect(p.hardBlockReasons).toContain("demo_fixture");
    expect(p.acceptedWrites).toEqual([]);
  });

  it("blocks oversized file", () => {
    const p = buildCsvImportPlan(
      base({ fileSizeBytes: MAX_FILE_BYTES + 1, totalRowCount: 1, rows: [row({ rowIndex: 0 })] }),
    );
    expect(p.hardBlockReasons).toContain("file_too_large");
  });

  it("blocks over-row-limit file", () => {
    const p = buildCsvImportPlan(
      base({ totalRowCount: MAX_ROWS + 1, rows: [row({ rowIndex: 0 })] }),
    );
    expect(p.hardBlockReasons).toContain("row_count_exceeded");
  });
});

describe("buildCsvImportPlan — mixed CSV", () => {
  it("produces accepted, blocked, ignored buckets deterministically", () => {
    const rows: PreviewRowInput[] = [
      row({ rowIndex: 0 }), // accepted
      row({ rowIndex: 1, metric: "bogus" }), // unknown metric
      row({ rowIndex: 2, capturedAtRaw: "not-a-date" }), // unparseable
      row({ rowIndex: 3, capturedAtRaw: "2010-01-01T00:00:00Z" }), // < 2020
      row({ rowIndex: 4, capturedAtRaw: "2030-01-01T00:00:00Z" }), // future
      row({ rowIndex: 5, value: null }), // non-numeric
    ];
    const p = buildCsvImportPlan(base({ totalRowCount: 6, rows }));
    expect(p.ok).toBe(true);
    expect(p.acceptedWrites.length).toBe(1);
    expect(p.blockedRows.length).toBe(5);
    const reasonCodes = p.blockedRows.flatMap((b) => b.reasons);
    expect(reasonCodes).toContain("unknown_metric");
    expect(reasonCodes).toContain("unparseable_captured_at");
    expect(reasonCodes).toContain("captured_at_before_2020");
    expect(reasonCodes).toContain("captured_at_future");
    expect(reasonCodes).toContain("non_numeric_value");
  });
});

describe("buildCsvImportPlan — duplicates", () => {
  const r = row({ rowIndex: 0 });

  it("skips rows whose idempotency key already exists; produces no summary when all duplicate", () => {
    const first = buildCsvImportPlan(base({ totalRowCount: 1, rows: [r] }));
    expect(first.acceptedWrites.length).toBe(1);
    const existing = new Set([first.acceptedWrites[0].idempotency_key]);

    const second = buildCsvImportPlan(
      base({ totalRowCount: 1, rows: [r], existingIdempotencyKeys: existing }),
    );
    expect(second.acceptedWrites).toEqual([]);
    expect(second.duplicateSkipped.length).toBe(1);
    expect(second.diarySummaryDraft).toBeNull();
  });
});

describe("buildCsvImportPlan — flag handling", () => {
  it("blocks the batch when >5% rows are hard-flagged", () => {
    const rows: PreviewRowInput[] = Array.from({ length: 20 }, (_, i) =>
      row({ rowIndex: i, hardFlags: i < 2 ? ["humidity_stuck"] : [] }),
    );
    const p = buildCsvImportPlan(base({ totalRowCount: 20, rows }));
    expect(p.hardBlockReasons).toContain("excess_hard_flags");
  });

  it("blocks all-hard-flagged file", () => {
    const rows = [
      row({ rowIndex: 0, metric: "ph", hardFlags: ["ph_out_of_range"] }),
      row({ rowIndex: 1, metric: "ec", hardFlags: ["ec_unit_ambiguous"] }),
    ];
    const p = buildCsvImportPlan(base({ totalRowCount: 2, rows }));
    expect(p.hardBlockReasons).toContain("excess_hard_flags");
    expect(p.acceptedWrites).toEqual([]);
  });

  it("ignores unmapped headers and device-control headers — never in writes", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0 })],
        unmappedHeaders: ["weird_col"],
        detectedDeviceControlHeaders: ["pump_relay_state", "fan_command"],
      }),
    );
    expect(p.ignoredUnmappedHeaders).toEqual(["weird_col"]);
    expect(p.ignoredDeviceControlHeaders).toEqual(["pump_relay_state", "fan_command"]);
    expect(JSON.stringify(p.acceptedWrites)).not.toMatch(/pump|relay|fan_command/);
  });
});

describe("buildCsvImportPlan — metric scoping", () => {
  it("tent-scoped metric never carries plant_id, even if ownership has plant", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0, metric: "temperature" })],
      }),
    );
    expect(p.acceptedWrites[0].plant_id).toBeNull();
  });

  it("plant-scoped metric attaches plant_id when present in ownership", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0, metric: "vwc", value: 0.35 })],
      }),
    );
    expect(p.acceptedWrites[0].plant_id).toBe("plant-1");
  });

  it("plant-scoped metric without plant context still accepted; plant_id null", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0, metric: "ph", value: 6.2 })],
        ownership: { ...OWNERSHIP_OK, plant: null },
      }),
    );
    expect(p.acceptedWrites[0].plant_id).toBeNull();
  });
});

describe("buildCsvImportPlan — ownership", () => {
  it("blocks unauthenticated context", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0 })],
        ownership: { ...OWNERSHIP_OK, authenticated: false, userId: null },
      }),
    );
    expect(p.hardBlockReasons).toContain("unauthenticated");
  });

  it("blocks unowned grow/tent/plant", () => {
    const p = buildCsvImportPlan(
      base({
        totalRowCount: 1,
        rows: [row({ rowIndex: 0 })],
        ownership: {
          ...OWNERSHIP_OK,
          grow: { id: "grow-1", ownerUserId: "other" },
          tent: { id: "tent-1", growId: "grow-1", ownerUserId: "other" },
          plant: { id: "plant-1", tentId: "tent-1", growId: "grow-1", ownerUserId: "other" },
        },
      }),
    );
    expect(p.hardBlockReasons).toEqual(
      expect.arrayContaining(["unowned_grow", "unowned_tent", "unowned_plant"]),
    );
  });
});

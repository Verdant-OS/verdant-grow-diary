/**
 * csv-history-duplicate-aware-import
 *
 * Proves that the duplicate-aware CSV history retry helpers:
 *   - SELECT only safe presence columns (tent_id, source, metric,
 *     captured_at) — never raw_payload, value, device_id, user_id, id
 *   - Scope the existing-rows query by tent_id, source set, metric set,
 *     and captured_at range
 *   - Skip duplicates that match on (tent_id, source, metric, captured_at)
 *   - Treat different tent / source / metric / captured_at as new rows
 *   - All-duplicate imports perform NO insert and return all-duplicate copy
 *   - Mixed imports insert only new rows and report both counts
 *   - No-duplicate imports insert all rows
 *   - Source stays "csv" (never promoted to live)
 *   - Static safety: no live/source promotion, no automation, no alerts,
 *     no service_role, no bridge tokens, no raw_payload SELECT
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SENSOR_READINGS_DEDUPE_SELECT_COLUMNS,
  SENSOR_READINGS_DEDUPE_SELECT_CLAUSE,
  CSV_HISTORY_DEDUPE_CONFLICT_COPY,
  buildBatchFailureMessage,
  buildDuplicateAwareSuccessMessage,
  dedupeKeyOf,
  filterDuplicateRows,
  runDuplicateAwareCsvHistoryImport,
  summarizeDedupeScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

type Row = {
  tent_id: string;
  source: string;
  metric: string;
  captured_at: string;
  value: number;
};

function row(
  tent_id: string,
  metric: string,
  captured_at: string,
  source = "csv",
  value = 1,
): Row {
  return { tent_id, source, metric, captured_at, value };
}

describe("SENSOR_READINGS_DEDUPE_SELECT_COLUMNS — safe presence columns only", () => {
  it("includes only tent_id, source, metric, captured_at", () => {
    expect([...SENSOR_READINGS_DEDUPE_SELECT_COLUMNS].sort()).toEqual([
      "captured_at",
      "metric",
      "source",
      "tent_id",
    ]);
  });
  it("never selects raw_payload, value, device_id, user_id, or row id", () => {
    for (const banned of ["raw_payload", "value", "device_id", "user_id"]) {
      expect(SENSOR_READINGS_DEDUPE_SELECT_CLAUSE).not.toContain(banned);
    }
    // "id" alone would match "tent_id"; only the standalone id column is forbidden.
    expect(SENSOR_READINGS_DEDUPE_SELECT_CLAUSE.split(",")).not.toContain("id");
  });
});

describe("summarizeDedupeScope — scopes by tent / source / metric / range", () => {
  it("returns sorted tent_ids, sources, metrics, and min/max captured_at", () => {
    const rows = [
      row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z"),
      row("tent-A", "humidity_pct", "2026-06-01T01:00:00.000Z"),
      row("tent-B", "temperature_c", "2026-06-02T00:00:00.000Z", "csv_import_ac_infinity"),
    ];
    const scope = summarizeDedupeScope(rows);
    expect(scope).not.toBeNull();
    expect(scope!.tentIds).toEqual(["tent-A", "tent-B"]);
    expect(scope!.sources).toEqual(["csv", "csv_import_ac_infinity"]);
    expect(scope!.metrics).toEqual(["humidity_pct", "temperature_c"]);
    expect(scope!.minCapturedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(scope!.maxCapturedAt).toBe("2026-06-02T00:00:00.000Z");
  });
  it("returns null when there are no rows", () => {
    expect(summarizeDedupeScope([])).toBeNull();
  });
});

describe("filterDuplicateRows — local dedupe matches the deployed index", () => {
  const existing = new Set<string>([
    dedupeKeyOf(row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z")),
  ]);

  it("skips rows matching an existing tent/source/metric/captured_at", () => {
    const r = filterDuplicateRows({
      rows: [row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z")],
      existingKeys: existing,
    });
    expect(r.newRows.length).toBe(0);
    expect(r.duplicateCount).toBe(1);
  });
  it("different tent_id is NOT a duplicate", () => {
    const r = filterDuplicateRows({
      rows: [row("tent-B", "temperature_c", "2026-06-01T00:00:00.000Z")],
      existingKeys: existing,
    });
    expect(r.newRows.length).toBe(1);
    expect(r.duplicateCount).toBe(0);
  });
  it("different source is NOT a duplicate", () => {
    const r = filterDuplicateRows({
      rows: [
        row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z", "csv_import_ac_infinity"),
      ],
      existingKeys: existing,
    });
    expect(r.newRows.length).toBe(1);
    expect(r.duplicateCount).toBe(0);
  });
  it("different metric is NOT a duplicate", () => {
    const r = filterDuplicateRows({
      rows: [row("tent-A", "humidity_pct", "2026-06-01T00:00:00.000Z")],
      existingKeys: existing,
    });
    expect(r.newRows.length).toBe(1);
    expect(r.duplicateCount).toBe(0);
  });
  it("different captured_at is NOT a duplicate", () => {
    const r = filterDuplicateRows({
      rows: [row("tent-A", "temperature_c", "2026-06-01T00:05:00.000Z")],
      existingKeys: existing,
    });
    expect(r.newRows.length).toBe(1);
    expect(r.duplicateCount).toBe(0);
  });
  it("also dedupes within the same import batch", () => {
    const r = filterDuplicateRows({
      rows: [
        row("tent-A", "temperature_c", "2026-06-02T00:00:00.000Z"),
        row("tent-A", "temperature_c", "2026-06-02T00:00:00.000Z"),
      ],
      existingKeys: new Set(),
    });
    expect(r.newRows.length).toBe(1);
    expect(r.duplicateCount).toBe(1);
  });
});

describe("runDuplicateAwareCsvHistoryImport — orchestration", () => {
  it("all-duplicate import performs NO insert and returns all-duplicate copy", async () => {
    const rows = [
      row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z"),
      row("tent-A", "humidity_pct", "2026-06-01T00:00:00.000Z"),
    ];
    const insertBatch = vi.fn(async () => ({ error: null }));
    const fetchExistingKeys = vi.fn(async () =>
      new Set(rows.map((r) => dedupeKeyOf(r))),
    );
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Spider Farmer / THP Data",
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.allDuplicates).toBe(true);
    expect(out.insertedRows).toBe(0);
    expect(out.duplicateRows).toBe(2);
    expect(insertBatch).not.toHaveBeenCalled();
    expect(out.diagnostic).toBe(
      "No new CSV history readings were imported. 2 readings already exist for this tent. No live sensor data was created.",
    );
  });

  it("scopes fetchExistingKeys by tent/source/metric/range derived from rows", async () => {
    const rows = [
      row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z"),
      row("tent-A", "humidity_pct", "2026-06-01T02:00:00.000Z"),
    ];
    const fetchExistingKeys = vi.fn(async () => new Set<string>());
    await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Spider Farmer",
      fetchExistingKeys,
      insertBatch: async () => ({ error: null }),
    });
    expect(fetchExistingKeys).toHaveBeenCalledTimes(1);
    const scope = (fetchExistingKeys.mock.calls[0] as unknown as [
      { tentIds: string[]; sources: string[]; metrics: string[]; minCapturedAt: string; maxCapturedAt: string },
    ])[0];
    expect(scope.tentIds).toEqual(["tent-A"]);
    expect(scope.sources).toEqual(["csv"]);
    expect(scope.metrics).toEqual(["humidity_pct", "temperature_c"]);
    expect(scope.minCapturedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(scope.maxCapturedAt).toBe("2026-06-01T02:00:00.000Z");
  });

  it("mixed duplicate/new import inserts only the new rows and reports both counts", async () => {
    const dup = row("tent-A", "temperature_c", "2026-06-01T00:00:00.000Z");
    const fresh = row("tent-A", "temperature_c", "2026-06-01T00:05:00.000Z");
    const inserted: Row[] = [];
    const out = await runDuplicateAwareCsvHistoryImport({
      rows: [dup, fresh],
      vendorLabel: "Spider Farmer / THP Data",
      fetchExistingKeys: async () => new Set([dedupeKeyOf(dup)]),
      insertBatch: async (batch) => {
        inserted.push(...batch);
        return { error: null };
      },
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(1);
    expect(out.duplicateRows).toBe(1);
    expect(inserted).toEqual([fresh]);
    expect(out.diagnostic).toBe(
      "Imported 1 new Spider Farmer / THP Data CSV history readings. Skipped 1 duplicate reading already present for this tent. No live sensor data was created.",
    );
    // Source stays csv — never promoted to live.
    for (const r of inserted) expect(r.source).toBe("csv");
  });

  it("no-duplicate import inserts every row and uses the across-batches copy", async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      row("tent-A", "temperature_c", `2026-06-01T00:0${i}:00.000Z`),
    );
    const insertBatch = vi.fn(async () => ({ error: null }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Spider Farmer / THP Data",
      batchSize: 2,
      fetchExistingKeys: async () => new Set<string>(),
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(3);
    expect(out.duplicateRows).toBe(0);
    expect(insertBatch).toHaveBeenCalledTimes(2);
    expect(out.diagnostic).toBe(
      "Imported 3 Spider Farmer / THP Data CSV history readings across 2 batches. No live sensor data was created.",
    );
  });

  it("single-batch no-duplicate uses the simpler copy without batch count", () => {
    expect(
      buildDuplicateAwareSuccessMessage({
        vendorLabel: "Spider Farmer",
        inserted: 5,
        duplicates: 0,
        totalBatches: 1,
      }),
    ).toBe(
      "Imported 5 Spider Farmer CSV history readings. No live sensor data was created.",
    );
  });
});

describe("23505 fallback copy remains friendly and tenant/tent scoped", () => {
  it("dedupe-conflict copy stays tent-local and never blames another tenant", () => {
    expect(CSV_HISTORY_DEDUPE_CONFLICT_COPY).toMatch(/this tent/i);
    expect(CSV_HISTORY_DEDUPE_CONFLICT_COPY).toContain(
      "No live sensor data was created.",
    );
    expect(CSV_HISTORY_DEDUPE_CONFLICT_COPY.toLowerCase()).not.toMatch(
      /another tenant|another account/,
    );
    // Names Verdant's dedupe-key fields so operators understand the match
    // without exposing raw Postgres internals as the headline.
    expect(CSV_HISTORY_DEDUPE_CONFLICT_COPY).toMatch(
      /user \+ tent \+ source \+ metric \+ captured timestamp/i,
    );
  });

  it("buildBatchFailureMessage on 23505 still includes friendly fallback + diagnostics", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 3,
      totalBatches: 42,
      failedBatchSize: 500,
      insertedRows: 1000,
      vendorLabel: "Spider Farmer / THP Data",
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
        details: null,
        hint: null,
      },
    });
    expect(msg).toContain(CSV_HISTORY_DEDUPE_CONFLICT_COPY);
    expect(msg).toContain("Import stopped on batch 3 of 42");
    expect(msg).toContain("1000 readings from earlier batches");
  });
});

describe("static safety — duplicate-aware module + import card", () => {
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const FILES = [
    "src/lib/csv-import/sensorReadingsBatchInsert.ts",
    "src/components/TentCsvImportCard.tsx",
  ];
  describe.each(FILES)("%s", (rel) => {
    const code = stripComments(
      readFileSync(resolve(process.cwd(), rel), "utf8"),
    );
    it("never promotes CSV rows to source = 'live'", () => {
      expect(code).not.toMatch(/source:\s*["']live["']/);
    });
    it("never references device control / automation / action_queue / alerts hot path", () => {
      for (const banned of ["deviceControl", "automation", "action_queue"]) {
        expect(code).not.toContain(banned);
      }
      // alerts table writes / inserts are forbidden in this hot path.
      expect(code).not.toMatch(/from\(["']alerts["']\)/);
    });
    it("never references service_role / bridge tokens / functions.invoke", () => {
      for (const banned of [
        "service_role",
        "SUPABASE_SERVICE_ROLE",
        "bridge_token",
        "BRIDGE_TOKEN",
        "functions.invoke",
      ]) {
        expect(code).not.toContain(banned);
      }
    });
    it("never SELECTs raw_payload from sensor_readings in the dedupe path", () => {
      expect(code).not.toMatch(/\.select\([^)]*raw_payload[^)]*\)/);
    });
  });
});

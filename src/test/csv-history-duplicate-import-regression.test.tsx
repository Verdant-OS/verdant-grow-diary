/**
 * csv-history-duplicate-import-regression
 *
 * Regression coverage for the historical CSV import duplicate-key crash:
 * re-importing a CSV, or a CSV containing duplicate rows, used to throw
 * "duplicate key value violates unique constraint sensor_readings_dedupe_uidx"
 * straight at the grower. Verdant now skips duplicates, counts them, and
 * shows a calm result instead — without weakening the deployed unique
 * index in any way.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
  CSV_SENSOR_SOURCE,
  type InsertClient,
} from "@/lib/environmentCsvImportPersistence";
import {
  dedupeKeyOf,
  CSV_HISTORY_DEDUPE_CONFLICT_COPY,
} from "@/lib/csv-import/sensorReadingsBatchInsert";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import { CSV_IMPORT_DESCRIPTION } from "@/lib/environmentCsvPreviewCopyRules";

const REPO_ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

const SCOPE = { user_id: "u1", grow_id: "g1", tent_id: "t1", plant_id: "p1" };

function row(over: Partial<ParsedEnvironmentRow> = {}): ParsedEnvironmentRow {
  return {
    rowNumber: 1,
    captured_at: "2026-06-01T10:00:00.000Z",
    temperature_c: 25,
    humidity_pct: 50,
    vpd_kpa: 1.58,
    co2_ppm: null,
    ppfd: null,
    raw_temperature: 77,
    raw_temp_unit: "F",
    raw_payload: { Timestamp: "2026-06-01T10:00:00Z", Temp: "77", RH: "50" },
    vpd_source: "derived",
    source_tag: "csv",
    ...over,
  };
}

async function uploadAndConfirm() {
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  const file = new File(["Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n"], "export.csv", {
    type: "text/csv",
  });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  await waitFor(() => expect(screen.queryByTestId("csv-import-done")).toBeTruthy());
}

describe("CSV history import — duplicate-key crash fix", () => {
  it("duplicate rows within the same CSV file are skipped, not crashed on", async () => {
    const inserted: unknown[] = [];
    const client: InsertClient = {
      async insertSensorReadings(rows) {
        inserted.push(...rows);
        return { error: null, insertedCount: rows.length };
      },
    };
    // The same reading appears twice in one "file" upload.
    const res = await persistCsvEnvironmentRows([row(), row()], SCOPE, client);
    expect(res.error).toBeNull();
    expect(res.insertedCount).toBe(3); // 1 row -> 3 metrics, deduped
    expect(res.duplicateCount).toBe(3); // the second copy of each metric
    expect(inserted).toHaveLength(3);
  });

  it("re-importing the same CSV skips already-imported rows instead of crashing", async () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    const existingKeys = new Set(
      inserts.map((i) => dedupeKeyOf(i)).filter((k): k is string => k !== null),
    );
    const insertSensorReadings = vi.fn(async (rows: unknown[]) => ({
      error: null,
      insertedCount: rows.length,
    }));
    const client: InsertClient = {
      insertSensorReadings,
      fetchExistingSensorReadingKeys: async () => existingKeys,
    };
    const res = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(res.error).toBeNull();
    expect(res.insertedCount).toBe(0);
    expect(res.duplicateCount).toBe(3);
    // Every row was already known to exist — no insert should even fire.
    expect(insertSensorReadings).not.toHaveBeenCalled();
  });

  it("a 23505 that still reaches Postgres is converted to calm feedback, never a raw error", async () => {
    const client: InsertClient = {
      async insertSensorReadings() {
        return {
          error: {
            message: 'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
            code: "23505",
            details: "Key (user_id, tent_id, source, metric, captured_at)=(...) already exists.",
          },
          insertedCount: 0,
        };
      },
      // No fetchExistingSensorReadingKeys — simulating the DB constraint
      // as the last line of defense (e.g. lookup unavailable, or a race
      // with a concurrent import).
    };
    const res = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(res.error).toBe(CSV_HISTORY_DEDUPE_CONFLICT_COPY);
    expect(res.error).not.toMatch(/violates unique constraint/i);
    expect(res.error).not.toMatch(/sensor_readings_dedupe_uidx/i);
  });

  it("CSV readings are labeled csv, never live", () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    expect(inserts.every((i) => i.source === CSV_SENSOR_SOURCE)).toBe(true);
    expect(inserts.every((i) => i.raw_payload.source_tag === "csv")).toBe(true);
  });

  it("CSV import copy names historical CSV context, not live data", () => {
    expect(CSV_IMPORT_DESCRIPTION.toLowerCase()).toMatch(/historical csv/);
  });

  it("done-state copy shows the duplicate-skipped count, never a raw Postgres error", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 2, duplicateCount: 5, error: null })}
      />,
    );
    await uploadAndConfirm();
    const text = screen.getByTestId("csv-import-done").textContent ?? "";
    expect(text).toMatch(/2/);
    expect(text.toLowerCase()).toMatch(/duplicate/);
    expect(text).not.toMatch(/violates unique constraint/i);
    cleanup();
  });

  it("an all-duplicate CSV shows a calm 'already exist' message, not '0 imported'", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 0, duplicateCount: 4, error: null })}
      />,
    );
    await uploadAndConfirm();
    const text = (screen.getByTestId("csv-import-done").textContent ?? "").toLowerCase();
    expect(text).toMatch(/already exist/);
    cleanup();
  });

  it("callers that predate duplicate-aware import (no duplicateCount) still render calmly", async () => {
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={async () => ({ insertedCount: 3, error: null })}
      />,
    );
    await uploadAndConfirm();
    const text = screen.getByTestId("csv-import-done").textContent ?? "";
    expect(text).toMatch(/3/);
    expect(text.toLowerCase()).toMatch(/csv reading/);
    cleanup();
  });

  it("the deployed sensor_readings_dedupe_uidx constraint is not dropped or weakened", () => {
    const migration = read(
      "supabase/migrations/20260617115621_a2a5d7f5-7c52-4dd9-a5bb-687e9d26f4df.sql",
    );
    expect(migration).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]+sensor_readings_dedupe_uidx[\s\S]*?\(\s*user_id\s*,\s*tent_id\s*,\s*source\s*,\s*metric\s*,\s*captured_at\s*\)/i,
    );
  });

  it("no Supabase write path is introduced on public/demo surfaces", () => {
    for (const rel of ["src/pages/Landing.tsx", "src/pages/Pricing.tsx"]) {
      const src = read(rel);
      expect(src).not.toMatch(/EnvironmentCsvImportLauncher|EnvironmentCsvImportModal/);
      expect(src).not.toMatch(/\.insert\(/);
    }
  });

  it("no device-control or autopilot language was introduced in the fixed files", () => {
    const all = [
      "src/lib/environmentCsvImportPersistence.ts",
      "src/lib/environmentCsvImportViewModel.ts",
      "src/components/EnvironmentCsvImportLauncher.tsx",
      "src/components/EnvironmentCsvImportModal.tsx",
    ]
      .map(read)
      .join("\n");
    for (const re of [
      /\bautopilot\b/i,
      /automatic\s+device\s+control/i,
      /controls\s+your\s+equipment/i,
      /hands[-\s]?free\s+grow\s+control/i,
    ]) {
      expect(all).not.toMatch(re);
    }
  });
});

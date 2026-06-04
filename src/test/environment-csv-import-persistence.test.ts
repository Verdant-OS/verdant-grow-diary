import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
  CSV_SENSOR_SOURCE,
} from "@/lib/environmentCsvImportPersistence";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";

const SCOPE = {
  user_id: "u1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: "p1",
};

function row(over: Partial<ParsedEnvironmentRow> = {}): ParsedEnvironmentRow {
  return {
    rowNumber: 1,
    captured_at: "2026-06-01T10:00:00.000Z",
    temperature_c: 25,
    humidity_pct: 50,
    vpd_kpa: 1.58,
    raw_temperature: 77,
    raw_temp_unit: "F",
    raw_payload: { Timestamp: "2026-06-01T10:00:00Z", Temp: "77", RH: "50" },
    source_tag: "csv",
    ...over,
  };
}

describe("environmentCsvImportPersistence — shape", () => {
  it("source is hardcoded to csv on every insert (test 26)", () => {
    const inserts = buildSensorReadingInserts([row(), row()], SCOPE);
    expect(inserts.every((i) => i.source === CSV_SENSOR_SOURCE)).toBe(true);
    expect(inserts.every((i) => i.raw_payload.source_tag === "csv")).toBe(true);
  });

  it("preserves raw + canonical fields (test 27)", () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    const t = inserts.find((i) => i.metric === "temperature_c");
    expect(t).toBeTruthy();
    expect(t!.value).toBe(25);
    expect(t!.raw_payload.raw_temperature).toBe(77);
    expect(t!.raw_payload.raw_temp_unit).toBe("F");
    expect(t!.raw_payload.grow_id).toBe("g1");
    expect(t!.raw_payload.tent_id).toBe("t1");
    expect(t!.raw_payload.plant_id).toBe("p1");
  });

  it("raw_payload includes original row (test 28)", () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    expect(inserts[0].raw_payload.raw_row.Timestamp).toBe("2026-06-01T10:00:00Z");
    expect(inserts[0].raw_payload.raw_row.Temp).toBe("77");
  });

  it("derived VPD is labeled vpd_source: derived", () => {
    const inserts = buildSensorReadingInserts([row()], SCOPE);
    const vpd = inserts.find((i) => i.metric === "vpd_kpa");
    expect(vpd?.raw_payload.vpd_source).toBe("derived");
  });

  it("skips null metrics (no fake zeros)", () => {
    const inserts = buildSensorReadingInserts(
      [row({ temperature_c: null, vpd_kpa: null })],
      SCOPE,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].metric).toBe("humidity_pct");
  });
});

describe("environmentCsvImportPersistence — runtime", () => {
  it("insert client receives chunks; returns total inserted", async () => {
    const calls: number[] = [];
    const client = {
      insertSensorReadings: vi.fn(async (rows: unknown[]) => {
        calls.push(rows.length);
        return { error: null, insertedCount: rows.length };
      }),
    };
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ rowNumber: i + 1 }),
    );
    const res = await persistCsvEnvironmentRows(rows, SCOPE, client, 5);
    expect(res.error).toBeNull();
    // 7 rows × 3 metrics = 21 inserts → chunks of 5,5,5,5,1
    expect(calls).toEqual([5, 5, 5, 5, 1]);
    expect(res.insertedCount).toBe(21);
  });

  it("does no work on empty input", async () => {
    const client = {
      insertSensorReadings: vi.fn(async () => ({ error: null, insertedCount: 0 })),
    };
    const res = await persistCsvEnvironmentRows([], SCOPE, client);
    expect(res.insertedCount).toBe(0);
    expect(client.insertSensorReadings).not.toHaveBeenCalled();
  });

  it("stops on first error", async () => {
    const client = {
      insertSensorReadings: vi.fn(async () => ({
        error: { message: "boom" },
        insertedCount: 0,
      })),
    };
    const res = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(res.error).toBe("boom");
  });
});

describe("environmentCsvImportPersistence — static safety (tests 29-32, 38-44)", () => {
  it("source contains no update/delete/alert/action_queue/live/automation paths", () => {
    const raw = readFileSync(
      resolve(__dirname, "../lib/environmentCsvImportPersistence.ts"),
      "utf8",
    );
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\balerts\b/i);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/bridge_token/i);
    expect(src).not.toMatch(/switchbot/i);
    expect(src).not.toMatch(/device.?control/i);
    expect(src).not.toMatch(/\bautomation\b/i);
    expect(src).not.toMatch(/\bscheduler\b/i);
    expect(src.toLowerCase()).not.toMatch(/"live"|'live'/);
  });
});

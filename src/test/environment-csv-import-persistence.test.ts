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

  it("CSV VPD is labeled vpd_source: csv", () => {
    const inserts = buildSensorReadingInserts([row({ vpd_source: "csv" })], SCOPE);
    const vpd = inserts.find((i) => i.metric === "vpd_kpa");
    expect(vpd?.raw_payload.vpd_source).toBe("csv");
  });

  it("persists Spider Farmer CO2 and PPFD metrics", () => {
    const inserts = buildSensorReadingInserts([row({ co2_ppm: 775, ppfd: 925 })], SCOPE);
    expect(inserts.map((i) => i.metric)).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "ppfd",
    ]);
    expect(inserts.find((i) => i.metric === "co2_ppm")?.value).toBe(775);
    expect(inserts.find((i) => i.metric === "ppfd")?.value).toBe(925);
  });

  it("skips null metrics (no fake zeros)", () => {
    const inserts = buildSensorReadingInserts([row({ temperature_c: null, vpd_kpa: null })], SCOPE);
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
    // Distinct captured_at per row: rows are deduped by
    // (tent_id, source, metric, captured_at) before insert, so identical
    // timestamps would collapse into one reading rather than exercising
    // chunk arithmetic across 7 genuinely distinct readings.
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({
        rowNumber: i + 1,
        captured_at: `2026-06-01T10:0${i}:00.000Z`,
      }),
    );
    const res = await persistCsvEnvironmentRows(rows, SCOPE, client, 5);
    expect(res.error).toBeNull();
    // 7 rows × 3 default metrics = 21 inserts → chunks of 5,5,5,5,1
    expect(calls).toEqual([5, 5, 5, 5, 1]);
    expect(res.insertedCount).toBe(21);
    expect(res.duplicateCount).toBe(0);
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
    expect(res.error).toMatch(/could not be completed/i);
    expect(res.error).not.toContain("boom");
    expect(res.partialWrite).toBe(false);
  });

  it("preserves a safe partial-write receipt when a later batch fails", async () => {
    let batch = 0;
    const client = {
      insertSensorReadings: vi.fn(async (rows: unknown[]) => {
        batch += 1;
        if (batch === 2) {
          return {
            error: {
              message: "raw postgres secret relation detail",
              code: "23514",
            },
            insertedCount: 0,
          };
        }
        return { error: null, insertedCount: rows.length };
      }),
    };
    const rows = [
      row({ humidity_pct: null, vpd_kpa: null }),
      row({
        rowNumber: 2,
        captured_at: "2026-06-01T10:01:00.000Z",
        humidity_pct: null,
        vpd_kpa: null,
      }),
    ];

    const res = await persistCsvEnvironmentRows(rows, SCOPE, client, 1);

    expect(res.insertedCount).toBe(1);
    expect(res.partialWrite).toBe(true);
    expect(res.error).toMatch(/1 CSV reading was saved/i);
    expect(res.error).toMatch(/review imported history before retrying/i);
    expect(res.error).not.toContain("raw postgres");
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
    expect(src).not.toMatch(new RegExp("switch" + "bot", "i"));
    expect(src).not.toMatch(/device.?control/i);
    expect(src).not.toMatch(/\bautomation\b/i);
    expect(src).not.toMatch(/\bscheduler\b/i);
    expect(src.toLowerCase()).not.toMatch(/"live"|'live'/);
  });
});

describe("CSV import response-loss recovery", () => {
  it("keeps an accepted but unacknowledged first batch uncertain, then skips it on explicit retry", async () => {
    const saved: ReturnType<typeof buildSensorReadingInserts> = [];
    const client = {
      insertSensorReadings: vi.fn(async (batch: typeof saved) => {
        saved.push(...batch);
        return { error: { message: "TypeError: fetch failed", code: "" }, insertedCount: 0 };
      }),
      fetchExistingSensorReadingKeys: async () =>
        new Set(saved.map((r) => [r.tent_id, r.source, r.metric, r.captured_at].join("|"))),
    };
    const first = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(saved).toHaveLength(3);
    expect(first.insertedCount).toBe(0);
    expect(first.unconfirmedWrite).toBe(true);
    expect(first.error).toMatch(/couldn.t confirm|unconfirmed/i);
    expect(first.error).not.toMatch(/No CSV readings were saved/);
    expect(client.insertSensorReadings).toHaveBeenCalledTimes(1);

    const retry = await persistCsvEnvironmentRows([row()], SCOPE, client);
    expect(retry.error).toBeNull();
    expect(retry.insertedCount).toBe(0);
    expect(retry.duplicateCount).toBe(3);
    expect(client.insertSensorReadings).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(3);
    expect(
      saved.every(
        (r) =>
          r.user_id === "u1" &&
          r.tent_id === "t1" &&
          r.raw_payload.grow_id === "g1" &&
          r.raw_payload.plant_id === "p1" &&
          r.source === "csv",
      ),
    ).toBe(true);
  });

  it("retains the acknowledged first batch when the later insert throws", async () => {
    const client = {
      insertSensorReadings: vi
        .fn()
        .mockResolvedValueOnce({ error: null, insertedCount: 1 })
        .mockRejectedValueOnce(new TypeError("private transport diagnostics")),
    };
    const pending = persistCsvEnvironmentRows(
      [
        row({ humidity_pct: null, vpd_kpa: null }),
        row({
          rowNumber: 2,
          captured_at: "2026-06-01T11:00:00.000Z",
          humidity_pct: null,
          vpd_kpa: null,
        }),
      ],
      SCOPE,
      client,
      1,
    );

    await expect(pending).resolves.toMatchObject({
      insertedCount: 1,
      partialWrite: true,
      unconfirmedWrite: true,
    });
    const result = await pending;
    expect(result.error).toMatch(/1 .*confirmed/i);
    expect(result.error).toMatch(/couldn.t confirm|unconfirmed/i);
    expect(result.error).not.toMatch(/private transport|No CSV readings were saved|stopped after/i);
    expect(client.insertSensorReadings).toHaveBeenCalledTimes(2);
  });

  it.each(["", undefined, "40003", "08006", "XX000", "PGRST500", "23", "23514suffix"])(
    "does not turn unknown outcome code %s into a zero-save claim",
    async (code) => {
      const result = await persistCsvEnvironmentRows([row()], SCOPE, {
        insertSensorReadings: async () => ({
          error: { message: "private driver text", code },
          insertedCount: 0,
        }),
      });
      expect(result.unconfirmedWrite).toBe(true);
      expect(result.error).not.toMatch(/No CSV readings were saved|private driver text/);
      expect(result.error).toMatch(/couldn.t confirm|unconfirmed/i);
    },
  );

  it.each(["23514", "22P02", "42501"])(
    "keeps definite rejection %s separate from uncertainty",
    async (code) => {
      const result = await persistCsvEnvironmentRows([row()], SCOPE, {
        insertSensorReadings: async () => ({
          error: { message: "private rejected row", code },
          insertedCount: 0,
        }),
      });
      expect(result.unconfirmedWrite === true).toBe(false);
      expect(result.error).toMatch(/No CSV readings were saved/);
      expect(result.error).not.toContain("private rejected row");
    },
  );

  it("retains two acknowledged batches when the final batch loses its reply", async () => {
    let batch = 0;
    const client = {
      insertSensorReadings: vi.fn(async (rows: unknown[]) => {
        batch += 1;
        if (batch <= 2) {
          return { error: null, insertedCount: rows.length };
        }
        throw new Error("response lost after a possible commit");
      }),
    };
    const rows = Array.from({ length: 450 }, (_, index) =>
      row({
        rowNumber: index + 1,
        captured_at: `2026-06-01T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`,
        humidity_pct: 50 + (index % 3),
        vpd_kpa: 1.2 + (index % 4) * 0.01,
      }),
    );

    const result = await persistCsvEnvironmentRows(rows, SCOPE, client, 500);

    expect(client.insertSensorReadings).toHaveBeenCalledTimes(3);
    expect(result.insertedCount).toBe(1000);
    expect(result.partialWrite).toBe(true);
    expect(result.unconfirmedWrite).toBe(true);
    expect(result.error).toContain("1000 CSV readings confirmed saved.");
    expect(result.error).toContain(
      "couldn't confirm whether the remaining CSV readings were saved.",
    );
    expect(result.error).not.toMatch(/No CSV readings were saved/);
  });
});

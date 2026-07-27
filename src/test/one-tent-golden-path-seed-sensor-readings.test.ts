/**
 * One-Tent golden-path seed — manual sensor snapshot contract.
 *
 * The seed is a CLI with deliberate process/env side effects, so this test
 * executes only its bounded sensor block against an in-memory Supabase-shaped
 * adapter. No network, database, auth session, or production data is touched.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SEED_SOURCE = readFileSync(
  resolve(ROOT, "scripts/e2e/seed-one-tent-golden-path.mjs"),
  "utf8",
);

const sensorBlockMatch = SEED_SOURCE.match(
  / {2}\/\/ ---------- Manual sensor snapshot ----------\r?\n([\s\S]*?)\r?\n {2}console\.log\("Fixture ownership: verified"\);/,
);

if (!sensorBlockMatch) {
  throw new Error("manual sensor snapshot seed block not found");
}

type SensorRow = Record<string, unknown>;
type ExistingSensorRow = {
  id: string;
  metric: string;
  captured_at: string;
};
type UpdateCall = { id: unknown; payload: SensorRow };
type LookupFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "contains"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<void>;

const executeSensorBlock = new AsyncFunction(
  "supabase",
  "userId",
  "tent",
  "plant",
  "FIXTURE",
  "console",
  sensorBlockMatch[1],
);

function makeSensorReadingsClient(existingRows: ExistingSensorRow[] = []) {
  const inserts: SensorRow[] = [];
  const updates: UpdateCall[] = [];
  const lookupFilters: LookupFilter[] = [];
  let maybeSingleCalls = 0;

  const lookupResult = { data: existingRows, error: null };
  const lookupBuilder = {
    select() {
      return this;
    },
    eq(column: string, value: unknown) {
      lookupFilters.push({ kind: "eq", column, value });
      return this;
    },
    contains(column: string, value: unknown) {
      lookupFilters.push({ kind: "contains", column, value });
      return this;
    },
    in(column: string, value: unknown[]) {
      lookupFilters.push({ kind: "in", column, value });
      return this;
    },
    maybeSingle() {
      maybeSingleCalls += 1;
      return Promise.resolve({
        data: existingRows.length > 0 ? existingRows[0] : null,
        error: null,
      });
    },
    then<TResult1 = typeof lookupResult, TResult2 = never>(
      onfulfilled?: ((value: typeof lookupResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(lookupResult).then(onfulfilled, onrejected);
    },
  };

  const client = {
    from(table: string) {
      expect(table).toBe("sensor_readings");
      return {
        select() {
          return lookupBuilder;
        },
        update(payload: SensorRow) {
          return {
            eq(column: string, id: unknown) {
              expect(column).toBe("id");
              updates.push({ id, payload });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(payload: SensorRow | SensorRow[]) {
          inserts.push(...(Array.isArray(payload) ? payload : [payload]));
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    client,
    inserts,
    updates,
    lookupFilters,
    get maybeSingleCalls() {
      return maybeSingleCalls;
    },
  };
}

const fixture = {
  snapshotAirTempF: 82,
  snapshotHumidityPct: 48,
  snapshotVpdKpa: 1.65,
};

async function runSensorBlock(existingRows: ExistingSensorRow[] = []) {
  const fake = makeSensorReadingsClient(existingRows);
  await executeSensorBlock(
    fake.client,
    "managed-user-1",
    { id: "tent-1" },
    { id: "plant-1" },
    fixture,
    { log() {} },
  );
  return fake;
}

describe("One-Tent golden-path manual sensor seed", () => {
  it("writes one canonical long-form row per metric with a shared manual snapshot timestamp", async () => {
    const { inserts, updates, lookupFilters } = await runSensorBlock();

    expect(updates).toEqual([]);
    expect(inserts).toHaveLength(3);
    expect(inserts.map(({ metric, value }) => [metric, value])).toEqual([
      ["temperature_c", 27.78],
      ["humidity_pct", 48],
      ["vpd_kpa", 1.65],
    ]);

    const capturedAt = inserts[0].captured_at;
    expect(typeof capturedAt).toBe("string");
    expect(Number.isNaN(Date.parse(String(capturedAt)))).toBe(false);

    for (const row of inserts) {
      expect(row).toEqual({
        tent_id: "tent-1",
        metric: expect.any(String),
        value: expect.any(Number),
        source: "manual",
        quality: "ok",
        captured_at: capturedAt,
        ts: capturedAt,
        raw_payload: {
          entered_by: "grower",
          unit_system: "imperial",
          golden_marker: "golden-path-manual-snapshot",
          plant_id: "plant-1",
        },
      });
      expect(row).not.toHaveProperty("air_temp_f");
      expect(row).not.toHaveProperty("humidity_pct");
      expect(row).not.toHaveProperty("vpd_kpa");
      expect(row).not.toHaveProperty("confidence");
      expect(row).not.toHaveProperty("plant_id");
    }

    expect(lookupFilters).toContainEqual({
      kind: "contains",
      column: "raw_payload",
      value: { golden_marker: "golden-path-manual-snapshot" },
    });
  });

  it("reconciles fixture-owned rows by metric and inserts only missing metrics", async () => {
    const existingCapturedAt = "2026-07-26T20:00:00.000Z";
    const result = await runSensorBlock([
      {
        id: "temperature-row",
        metric: "temperature_c",
        captured_at: existingCapturedAt,
      },
      {
        id: "humidity-row",
        metric: "humidity_pct",
        captured_at: existingCapturedAt,
      },
    ]);

    expect(result.maybeSingleCalls).toBe(0);
    expect(result.updates).toEqual([]);
    expect(result.inserts.map(({ metric }) => metric)).toEqual(["vpd_kpa"]);
    expect(result.inserts[0].captured_at).toBe(existingCapturedAt);
    expect(result.inserts[0].ts).toBe(existingCapturedAt);
    expect(result.lookupFilters).toEqual(
      expect.arrayContaining([
        { kind: "eq", column: "user_id", value: "managed-user-1" },
        { kind: "eq", column: "tent_id", value: "tent-1" },
        { kind: "eq", column: "source", value: "manual" },
        {
          kind: "contains",
          column: "raw_payload",
          value: { golden_marker: "golden-path-manual-snapshot" },
        },
      ]),
    );
  });
});

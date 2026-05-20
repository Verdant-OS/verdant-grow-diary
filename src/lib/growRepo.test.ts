import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable fake Supabase query builder.
type Result = { data: unknown; error: unknown };
let nextResult: Result = { data: [], error: null };
const calls: { table?: string; filters: Array<[string, unknown]>; ordered?: string; limited?: number; inserted?: unknown; single?: boolean } = { filters: [] };

function reset() {
  nextResult = { data: [], error: null };
  calls.table = undefined;
  calls.filters = [];
  calls.ordered = undefined;
  calls.limited = undefined;
  calls.inserted = undefined;
  calls.single = false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: (col: string, val: unknown) => { calls.filters.push([col, val]); return b; },
    order: (col: string) => { calls.ordered = col; return b; },
    limit: (n: number) => { calls.limited = n; return b; },
    maybeSingle: () => { calls.single = true; return Promise.resolve(nextResult); },
    insert: (row: unknown) => { calls.inserted = row; return Promise.resolve(nextResult); },
    then: (resolve: (r: Result) => unknown) => Promise.resolve(nextResult).then(resolve),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => { calls.table = table; return builder(); } },
}));

import { fetchTents, fetchTent, fetchPlants, fetchSensorReadings, insertSensorReading } from "./growRepo";

beforeEach(reset);

const TENT_UUID = "11111111-1111-4111-8111-111111111111";
const TENT_UUID_2 = "22222222-2222-4222-8222-222222222222";

const tentRow = {
  id: TENT_UUID, user_id: "u", name: "A", brand: null, size: null,
  stage: "veg", light_on: true, light_schedule: null, light_wattage: null,
  is_archived: false, schema_version: 1,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

describe("fetchTents", () => {
  it("returns mapped rows on happy path", async () => {
    nextResult = { data: [tentRow], error: null };
    const r = await fetchTents();
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(TENT_UUID);
    expect(calls.table).toBe("tents");
    expect(calls.filters).toContainEqual(["is_archived", false]);
  });
  it("returns [] on empty result", async () => {
    nextResult = { data: [], error: null };
    expect(await fetchTents()).toEqual([]);
  });
  it("returns [] when data is null", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchTents()).toEqual([]);
  });
  it("throws on supabase error", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(fetchTents()).rejects.toThrow(/fetchTents.*boom/);
  });
});

describe("fetchTent", () => {
  it("returns null for empty id without calling supabase", async () => {
    expect(await fetchTent("")).toBeNull();
    expect(calls.table).toBeUndefined();
  });
  it("returns null when row missing", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchTent(TENT_UUID)).toBeNull();
    expect(calls.single).toBe(true);
  });
});

describe("fetchPlants", () => {
  it("filters by tentId when provided", async () => {
    nextResult = { data: [], error: null };
    await fetchPlants(TENT_UUID_2);
    expect(calls.filters).toContainEqual(["tent_id", TENT_UUID_2]);
  });
  it("omits tent filter when not provided", async () => {
    nextResult = { data: [], error: null };
    await fetchPlants();
    expect(calls.filters.find(([c]) => c === "tent_id")).toBeUndefined();
  });
  it("throws on supabase error", async () => {
    nextResult = { data: null, error: { message: "nope" } };
    await expect(fetchPlants()).rejects.toThrow(/fetchPlants.*nope/);
  });
});

describe("fetchSensorReadings", () => {
  it("applies limit and order", async () => {
    nextResult = { data: [], error: null };
    await fetchSensorReadings(TENT_UUID);
    expect(calls.ordered).toBe("ts");
    expect(calls.limited).toBe(2000);
  });
  it("returns empty array on no data", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchSensorReadings()).toEqual([]);
  });
});

describe("insertSensorReading", () => {
  it("forwards the row payload", async () => {
    nextResult = { data: null, error: null };
    await insertSensorReading({ user_id: "u", tent_id: TENT_UUID, metric: "temperature_c", value: 22 } as never);
    expect(calls.table).toBe("sensor_readings");
    expect(calls.inserted).toMatchObject({ metric: "temperature_c", value: 22 });
  });
  it("throws on error", async () => {
    nextResult = { data: null, error: { message: "denied" } };
    await expect(insertSensorReading({ user_id: "u", tent_id: TENT_UUID, metric: "temperature_c", value: 1 } as never))
      .rejects.toThrow(/insertSensorReading.*denied/);
  });
});

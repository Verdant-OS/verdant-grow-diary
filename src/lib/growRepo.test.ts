import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable fake Supabase query builder.
type Result = { data: unknown; error: unknown };
let nextResult: Result = { data: [], error: null };
let resultQueue: Result[] = [];
let orFilter: string | undefined;
const calls: {
  table?: string;
  fromTables?: string[];
  filters: Array<[string, unknown]>;
  ordered?: string[];
  limited?: number;
  inserted?: unknown;
  single?: boolean;
} = { filters: [] };

function reset() {
  nextResult = { data: [], error: null };
  resultQueue = [];
  orFilter = undefined;
  calls.table = undefined;
  calls.fromTables = [];
  calls.filters = [];
  calls.ordered = [];
  calls.limited = undefined;
  calls.inserted = undefined;
  calls.single = false;
}

function builder(): any {
  const b: any = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return b;
    },
    or: (filter: string) => {
      orFilter = filter;
      return b;
    },
    order: (col: string) => {
      calls.ordered ??= [];
      calls.ordered.push(col);
      return b;
    },
    limit: (n: number) => {
      calls.limited = n;
      return b;
    },
    maybeSingle: () => {
      calls.single = true;
      return Promise.resolve(nextResult);
    },
    insert: (row: unknown) => {
      calls.inserted = row;
      return Promise.resolve(nextResult);
    },
    then: (resolve: (r: Result) => unknown) =>
      Promise.resolve(resultQueue.shift() ?? nextResult).then(resolve),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.fromTables ??= [];
      calls.fromTables.push(table);
      calls.table = table;
      return builder();
    },
  },
}));

import {
  fetchTents,
  fetchTent,
  fetchPlants,
  fetchPlant,
  fetchSensorReadings,
  insertSensorReading,
  insertSensorReadingsBatch,
} from "./growRepo";

beforeEach(reset);

const TENT_UUID = "11111111-1111-4111-8111-111111111111";
const TENT_UUID_2 = "22222222-2222-4222-8222-222222222222";
const GROW_UUID = "33333333-3333-4333-8333-333333333333";
const PLANT_UUID = "44444444-4444-4444-8444-444444444444";
const PLANT_UUID_2 = "55555555-5555-4555-8555-555555555555";

const validPlantRow = {
  id: PLANT_UUID,
  user_id: "u",
  name: "Blue Dream",
  strain: "BD",
  tent_id: TENT_UUID,
  grow_id: GROW_UUID,
  stage: "veg",
  health: "healthy",
  plant_type: "photoperiod",
  is_archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const tentRow = {
  id: TENT_UUID,
  user_id: "u",
  name: "A",
  brand: null,
  size: null,
  stage: "veg",
  light_on: true,
  light_schedule: null,
  light_wattage: null,
  is_archived: false,
  schema_version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("fetchTents", () => {
  it("returns [] for a legacy non-UUID growId without querying Supabase", async () => {
    expect(await fetchTents("g1")).toEqual([]);
    expect(calls.table).toBeUndefined();
  });

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
  it("returns null for a legacy non-UUID id without querying Supabase", async () => {
    expect(await fetchTent("t1")).toBeNull();
    expect(calls.table).toBeUndefined();
  });
  it("returns null when row missing", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchTent(TENT_UUID)).toBeNull();
    expect(calls.single).toBe(true);
  });
});

describe("fetchPlants", () => {
  it("returns [] for a legacy non-UUID tentId without querying Supabase", async () => {
    expect(await fetchPlants("t1")).toEqual([]);
    expect(calls.table).toBeUndefined();
  });
  it("returns [] for a legacy non-UUID growId without querying Supabase", async () => {
    expect(await fetchPlants(undefined, "g1")).toEqual([]);
    expect(calls.table).toBeUndefined();
  });
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

  it("rolls up grow-scoped plants through tent attribution filter", async () => {
    resultQueue = [
      { data: [{ id: TENT_UUID }], error: null },
      { data: [validPlantRow], error: null },
    ];
    const plants = await fetchPlants(undefined, GROW_UUID);
    expect(calls.fromTables).toEqual(["plants", "tents"]);
    expect(calls.filters).toContainEqual(["grow_id", GROW_UUID]);
    expect(orFilter).toBe(`grow_id.eq.${GROW_UUID},tent_id.in.(${TENT_UUID})`);
    expect(plants).toHaveLength(1);
    expect(plants[0]?.id).toBe(PLANT_UUID);
  });

  it("degrades grow-scoped filter to grow_id only when tent rollup is empty", async () => {
    resultQueue = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    await fetchPlants(undefined, GROW_UUID);
    expect(orFilter).toBe(`grow_id.eq.${GROW_UUID}`);
  });

  it("drops malformed plant rows from fetchPlants results", async () => {
    nextResult = {
      data: [validPlantRow, { id: PLANT_UUID_2, name: "missing plant_type" }],
      error: null,
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plants = await fetchPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]?.id).toBe(PLANT_UUID);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/dropped 1 malformed plant row\(s\)/),
    );
    warnSpy.mockRestore();
  });
});

describe("fetchPlant", () => {
  it("returns null for a legacy non-UUID id without querying Supabase", async () => {
    expect(await fetchPlant("t1")).toBeNull();
    expect(calls.table).toBeUndefined();
  });

  it("returns null when row missing", async () => {
    nextResult = { data: null, error: null };
    expect(await fetchPlant(PLANT_UUID)).toBeNull();
    expect(calls.single).toBe(true);
  });

  it("throws when the row fails validation", async () => {
    nextResult = { data: { id: PLANT_UUID, name: "P" }, error: null };
    await expect(fetchPlant(PLANT_UUID)).rejects.toThrow(/plant row failed validation/);
  });

  it("returns mapped plant on valid row", async () => {
    nextResult = { data: validPlantRow, error: null };
    const plant = await fetchPlant(PLANT_UUID);
    expect(plant?.id).toBe(PLANT_UUID);
    expect(plant?.name).toBe("Blue Dream");
    expect(plant?.growId).toBe(GROW_UUID);
  });
});

describe("fetchSensorReadings", () => {
  it("reads the effective view and orders by physical capture time before the legacy ts fallback", async () => {
    nextResult = { data: [], error: null };
    await fetchSensorReadings(TENT_UUID);
    expect(calls.table).toBe("sensor_readings_effective");
    expect(calls.ordered).toEqual(["captured_at", "ts"]);
    expect(calls.limited).toBe(2000);
  });
  it("returns an empty grouped result for a validated empty packet", async () => {
    nextResult = { data: [], error: null };
    expect(await fetchSensorReadings()).toEqual([]);
  });
  it("fails closed when the effective view response is not an array", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchSensorReadings()).rejects.toThrow(/Sensor readings are unavailable\./);
  });
  it("treats null as explicit no-scope without querying Supabase", async () => {
    expect(await fetchSensorReadings(null)).toEqual([]);
    expect(calls.table).toBeUndefined();
  });
  it("returns [] for a legacy non-UUID tentId without querying Supabase", async () => {
    expect(await fetchSensorReadings("t1")).toEqual([]);
    expect(calls.table).toBeUndefined();
  });
  it("fails closed when the effective view returns invalid correction evidence", async () => {
    nextResult = {
      data: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          tent_id: TENT_UUID,
          metric: "temperature_c",
          value: 24,
          source: "manual",
          quality: "ok",
          ts: "2026-09-16T12:00:00.000Z",
          created_at: "2026-09-16T12:00:00.000Z",
          captured_at: "2026-09-16T12:00:00.000Z",
          device_id: null,
          raw_payload: null,
          correction_valid: false,
        },
      ],
      error: null,
    };
    await expect(fetchSensorReadings(TENT_UUID)).rejects.toThrow(
      /Sensor readings are unavailable\./,
    );
  });
  it("groups validated effective rows into domain readings", async () => {
    const observed = "2026-09-16T12:00:00.000Z";
    nextResult = {
      data: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          tent_id: TENT_UUID,
          metric: "temperature_c",
          value: 24,
          source: "manual",
          quality: "ok",
          ts: observed,
          created_at: observed,
          captured_at: observed,
          device_id: null,
          raw_payload: null,
          correction_valid: true,
        },
      ],
      error: null,
    };
    const readings = await fetchSensorReadings(TENT_UUID);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      tentId: TENT_UUID,
      temp: 24,
      source: "manual",
    });
  });
  it("throws on supabase error", async () => {
    nextResult = { data: null, error: { message: "permission denied" } };
    await expect(fetchSensorReadings(TENT_UUID)).rejects.toThrow(
      /fetchSensorReadings.*permission denied/,
    );
  });
  it("applies tent_id filter when scoped to one tent", async () => {
    nextResult = { data: [], error: null };
    await fetchSensorReadings(TENT_UUID);
    expect(calls.filters).toContainEqual(["tent_id", TENT_UUID]);
  });
});

describe("insertSensorReadingsBatch", () => {
  const batchRow = {
    user_id: "u",
    tent_id: TENT_UUID,
    metric: "temperature_c",
    value: 22,
    source: "manual",
    ts: "2026-01-01T00:00:00Z",
    captured_at: "2026-01-01T00:00:00Z",
  };

  it("forwards the batch payload to sensor_readings", async () => {
    nextResult = { data: null, error: null };
    await insertSensorReadingsBatch([batchRow as never]);
    expect(calls.table).toBe("sensor_readings");
    expect(calls.inserted).toEqual([batchRow]);
  });

  it("no-ops on an empty batch", async () => {
    await insertSensorReadingsBatch([]);
    expect(calls.table).toBeUndefined();
  });

  it("preserves Postgres error.code on batch insert failure", async () => {
    nextResult = { data: null, error: { code: "23505", message: "duplicate key" } };
    await expect(insertSensorReadingsBatch([batchRow as never])).rejects.toMatchObject({
      code: "23505",
      message: expect.stringMatching(/insertSensorReadingsBatch.*duplicate key/),
    });
  });
});

describe("insertSensorReading", () => {
  it("forwards the row payload", async () => {
    nextResult = { data: null, error: null };
    await insertSensorReading({
      user_id: "u",
      tent_id: TENT_UUID,
      metric: "temperature_c",
      value: 22,
    } as never);
    expect(calls.table).toBe("sensor_readings");
    expect(calls.inserted).toMatchObject({ metric: "temperature_c", value: 22 });
  });
  it("throws on error", async () => {
    nextResult = { data: null, error: { message: "denied" } };
    await expect(
      insertSensorReading({
        user_id: "u",
        tent_id: TENT_UUID,
        metric: "temperature_c",
        value: 1,
      } as never),
    ).rejects.toThrow(/insertSensorReading.*denied/);
  });
});

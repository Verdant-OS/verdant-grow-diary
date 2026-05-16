import { describe, it, expect } from "vitest";
import { mapTentRow, mapPlantRow, mapSensorReadingRow, groupSensorReadingRows } from "./growAdapters";
import { tents, plants, sensorReadings } from "@/mock";

const tentRow = {
  id: "tent-1",
  user_id: "u1",
  name: "Tent A",
  brand: "Spider Farmer",
  size: "4x4",
  stage: "flower",
  light_on: true,
  light_schedule: "12/12",
  light_wattage: 450,
  is_archived: false,
  schema_version: 1,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
} as const;

const plantRow = {
  id: "plant-1",
  user_id: "u1",
  tent_id: "tent-1",
  name: "GG #1",
  strain: "Gorilla Glue #4",
  stage: "flower",
  started_at: "2026-02-10T00:00:00Z",
  health: "watch",
  photo_url: "https://example.com/p.jpg",
  last_note: "Trichomes cloudy",
  is_archived: false,
  schema_version: 1,
  created_at: "2026-02-10T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
} as const;

describe("mapTentRow", () => {
  it("maps a valid tent row", () => {
    const t = mapTentRow(tentRow);
    expect(t).toEqual({
      id: "tent-1",
      name: "Tent A",
      brand: "Spider Farmer",
      size: "4x4",
      stage: "flower",
      light: { on: true, schedule: "12/12", wattage: 450 },
      alertCount: 0,
    });
  });
  it("applies safe defaults for nullable fields", () => {
    const t = mapTentRow({ ...tentRow, brand: null, size: null, light_schedule: null, light_wattage: null, stage: "bogus" });
    expect(t.brand).toBe("");
    expect(t.size).toBe("");
    expect(t.light.schedule).toBe("");
    expect(t.light.wattage).toBe(0);
    expect(t.stage).toBe("seedling");
  });
});

describe("mapPlantRow", () => {
  it("maps a valid plant row", () => {
    const p = mapPlantRow(plantRow);
    expect(p).toEqual({
      id: "plant-1",
      name: "GG #1",
      strain: "Gorilla Glue #4",
      tentId: "tent-1",
      stage: "flower",
      startedAt: "2026-02-10T00:00:00Z",
      health: "watch",
      photo: "https://example.com/p.jpg",
      lastNote: "Trichomes cloudy",
    });
  });
  it("defaults null tent_id, strain, photo, note, and invalid health", () => {
    const p = mapPlantRow({ ...plantRow, tent_id: null, strain: null, photo_url: null, last_note: null, health: "weird" });
    expect(p.tentId).toBe("");
    expect(p.strain).toBe("");
    expect(p.photo).toBe("");
    expect(p.lastNote).toBe("");
    expect(p.health).toBe("healthy");
  });
});

describe("mapSensorReadingRow", () => {
  const base = {
    id: "r1",
    user_id: "u1",
    tent_id: "tent-1",
    ts: "2026-05-01T12:00:00Z",
    quality: "ok",
    source: "manual",
    created_at: "2026-05-01T12:00:00Z",
  };
  it("maps each metric onto the correct field", () => {
    expect(mapSensorReadingRow({ ...base, metric: "temperature_c", value: 24.5 })).toMatchObject({ temp: 24.5, rh: 0, vpd: 0, co2: 0, soil: 0 });
    expect(mapSensorReadingRow({ ...base, metric: "humidity_pct", value: 55 })).toMatchObject({ rh: 55 });
    expect(mapSensorReadingRow({ ...base, metric: "vpd_kpa", value: 1.2 })).toMatchObject({ vpd: 1.2 });
    expect(mapSensorReadingRow({ ...base, metric: "co2_ppm", value: 800 })).toMatchObject({ co2: 800 });
    expect(mapSensorReadingRow({ ...base, metric: "soil_moisture_pct", value: 40 })).toMatchObject({ soil: 40 });
  });
  it("preserves ts and tentId", () => {
    const r = mapSensorReadingRow({ ...base, metric: "temperature_c", value: 22 });
    expect(r.ts).toBe("2026-05-01T12:00:00Z");
    expect(r.tentId).toBe("tent-1");
  });
  it("treats unknown metric as zero values", () => {
    const r = mapSensorReadingRow({ ...base, metric: "unknown", value: 99 });
    expect(r).toMatchObject({ temp: 0, rh: 0, vpd: 0, co2: 0, soil: 0 });
  });
});

describe("groupSensorReadingRows", () => {
  const base = { id: "r", user_id: "u", quality: "ok", source: "manual", created_at: "x" };
  const row = (tent_id: string, ts: string, metric: string, value: number, id = `${tent_id}-${ts}-${metric}`) =>
    ({ ...base, id, tent_id, ts, metric, value }) as any;

  it("merges five metrics at the same ts/tent into one reading", () => {
    const ts = "2026-05-01T12:00:00Z";
    const out = groupSensorReadingRows([
      row("t1", ts, "temperature_c", 24),
      row("t1", ts, "humidity_pct", 55),
      row("t1", ts, "vpd_kpa", 1.2),
      row("t1", ts, "co2_ppm", 800),
      row("t1", ts, "soil_moisture_pct", 40),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ ts, tentId: "t1", temp: 24, rh: 55, vpd: 1.2, co2: 800, soil: 40 });
  });

  it("produces two readings for two timestamps, newest first", () => {
    const older = "2026-05-01T10:00:00Z";
    const newer = "2026-05-01T12:00:00Z";
    const out = groupSensorReadingRows([
      row("t1", older, "temperature_c", 20),
      row("t1", newer, "temperature_c", 25),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].ts).toBe(newer);
    expect(out[1].ts).toBe(older);
  });

  it("does not crash on sparse metrics; missing default to 0", () => {
    const out = groupSensorReadingRows([row("t1", "2026-05-01T12:00:00Z", "temperature_c", 22)]);
    expect(out[0]).toMatchObject({ temp: 22, rh: 0, vpd: 0, co2: 0, soil: 0 });
  });

  it("does not merge rows from different tents at the same ts", () => {
    const ts = "2026-05-01T12:00:00Z";
    const out = groupSensorReadingRows([
      row("t1", ts, "temperature_c", 22),
      row("t2", ts, "temperature_c", 28),
    ]);
    expect(out).toHaveLength(2);
    const tents = out.map((r) => r.tentId).sort();
    expect(tents).toEqual(["t1", "t2"]);
  });

  it("returns [] for empty input", () => {
    expect(groupSensorReadingRows([])).toEqual([]);
  });
});

describe("mock data immutability", () => {
  it("adapters do not mutate exported mock arrays", () => {
    const tentsSnap = JSON.stringify(tents);
    const plantsSnap = JSON.stringify(plants);
    const sensorsSnap = JSON.stringify(sensorReadings);
    // Run mappers over copies just to exercise call sites.
    mapTentRow(tentRow);
    mapPlantRow(plantRow);
    mapSensorReadingRow({ id: "x", user_id: "u", tent_id: "t", ts: "x", quality: "ok", source: "manual", created_at: "x", metric: "temperature_c", value: 1 });
    expect(JSON.stringify(tents)).toBe(tentsSnap);
    expect(JSON.stringify(plants)).toBe(plantsSnap);
    expect(JSON.stringify(sensorReadings)).toBe(sensorsSnap);
  });
});

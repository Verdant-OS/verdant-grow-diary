import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { findSupabaseTableWrites } from "@/test/helpers/supabaseTableWriteScan";

const ADJACENT_REGEX = /from\(["']sensor_readings["']\)\s*\.(insert|update|delete|upsert)/;

describe("findSupabaseTableWrites", () => {
  it("flags an adjacent from().insert chain", () => {
    const source = `await supabase.from("sensor_readings").insert({ metric: "rh" });`;
    expect(source).toMatch(ADJACENT_REGEX);
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([
      { table: "sensor_readings", method: "insert" },
    ]);
  });

  it("flags an aliased builder the adjacent regex misses", () => {
    const source = `
      const readings = supabase.from("sensor_readings");
      await readings.insert({ metric: "temperature_c" });
    `;
    expect(source).not.toMatch(ADJACENT_REGEX);
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([
      { table: "sensor_readings", method: "insert" },
    ]);
  });

  it("flags chained select then write through a const table name", () => {
    const source = `
      const table = "sensor_readings";
      const q = client.from(table).select("id");
      await q.delete().eq("id", id);
    `;
    expect(source).not.toMatch(ADJACENT_REGEX);
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([
      { table: "sensor_readings", method: "delete" },
    ]);
  });

  it("does not flag a select-only from(sensor_readings) chain", () => {
    const source = `
      await supabase
        .from("sensor_readings")
        .select("id,tent_id,metric,value,source,ts")
        .eq("source", "manual");
    `;
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([]);
  });

  it("does not flag writes to a different table", () => {
    const source = `await supabase.from("diary_entries").insert({ note: "x" });`;
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([]);
  });

  it("does not treat URLSearchParams.delete as a sensor_readings write", () => {
    const source = `
      const next = new URLSearchParams(searchParams);
      next.delete("sensorSources");
    `;
    expect(findSupabaseTableWrites(source, "sensor_readings")).toEqual([]);
  });

  it("Timeline.tsx has no sensor_readings write receiver", () => {
    const timeline = readFileSync(resolve(process.cwd(), "src/pages/Timeline.tsx"), "utf8");
    expect(findSupabaseTableWrites(timeline, "sensor_readings", "Timeline.tsx")).toEqual([]);
  });
});

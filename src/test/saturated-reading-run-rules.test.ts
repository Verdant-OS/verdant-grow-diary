import { describe, expect, it } from "vitest";
import { detectFlags, suggestMappings } from "@/lib/csvSensorPreviewRules";
import { summarizeImportPreview } from "@/lib/sensorImportSourceApps";
import { SaturatedReadingRunRules } from "@/lib/saturatedReadingRunRules";

function csv(metricHeader: string, values: number[]): string {
  const lines = values.map(
    (value, index) => `2026-05-31 ${String(index).padStart(2, "0")}:00:00,${value}`,
  );
  return [`Timestamp,${metricHeader}`, ...lines].join("\n");
}

describe("SaturatedReadingRunRules", () => {
  it("documents a 12-reading minimum", () => {
    expect(SaturatedReadingRunRules.minimumRunLength).toBe(12);
  });

  it("flags a 130-reading run inside otherwise normal soil moisture", () => {
    const values = [...Array(10).fill(42), ...Array(130).fill(100), ...Array(8).fill(55)];
    const samples = values.map((value, index) => ({
      value,
      at: `2026-05-31 ${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00`,
      index,
    }));
    const runs = SaturatedReadingRunRules.findRuns("soil_moisture_pct", samples);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ value: 100, length: 130 });
    expect(SaturatedReadingRunRules.describe(runs[0])).toContain("soil_moisture_pct");
    expect(SaturatedReadingRunRules.describe(runs[0])).toContain(
      "130 consecutive readings at 100%",
    );
    expect(SaturatedReadingRunRules.describe(runs[0])).toContain(runs[0].startedAt!);
    expect(SaturatedReadingRunRules.describe(runs[0])).toContain(runs[0].endedAt!);
  });

  it("does not flag a single 100 or an 11-reading stretch", () => {
    const samples = [40, 100, 41, ...Array(11).fill(0), 38].map((value, index) => ({
      value,
      at: `2026-06-01T00:${String(index).padStart(2, "0")}:00Z`,
      index,
    }));
    expect(SaturatedReadingRunRules.findRuns("humidity_pct", samples)).toEqual([]);
  });

  it("orders a reversed export by timestamp before measuring the run", () => {
    const forward = Array.from({ length: 12 }, (_, index) => ({
      value: 100,
      at: `2026-06-02T00:${String(index).padStart(2, "0")}:00Z`,
      index,
    }));
    const reversed = forward
      .slice()
      .reverse()
      .map((sample, index) => ({ ...sample, index }));
    const runs = SaturatedReadingRunRules.findRuns("humidity_pct", reversed);
    expect(runs).toHaveLength(1);
    expect(runs[0].startedAt).toBe("2026-06-02T00:00:00Z");
    expect(runs[0].endedAt).toBe("2026-06-02T00:11:00Z");
  });
});

describe("import review saturated runs", () => {
  it("flags a soil-moisture run inside an otherwise normal GGS-style file", () => {
    const values = [...Array(6).fill(48), ...Array(130).fill(100), ...Array(4).fill(51)];
    const flags = detectFlags(
      ["Timestamp", "soil_moisture_pct"],
      csv("soil_moisture_pct", values)
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(",")),
      suggestMappings(["Timestamp", "soil_moisture_pct"]),
    );
    const run = flags.find((flag) => flag.code === "saturated_reading_run");
    expect(run?.severity).toBe("warn");
    expect(run?.message).toContain("soil_moisture_pct");
    expect(run?.message).toContain("130 consecutive readings at 100%");
    expect(flags.some((flag) => flag.code === "vwc_stuck")).toBe(false);
  });

  it("does not flag a short humidity stretch mixed with normal readings", () => {
    const values = [55, 100, 100, 100, 54, 53];
    const flags = detectFlags(
      ["Timestamp", "humidity_pct"],
      values.map((value, index) => [`2026-06-01T01:0${index}:00Z`, String(value)]),
      suggestMappings(["Timestamp", "humidity_pct"]),
    );
    expect(
      flags.filter(
        (flag) => flag.code === "saturated_reading_run" || flag.code === "humidity_stuck",
      ),
    ).toEqual([]);
  });

  it("still flags a file whose every humidity value is 100", () => {
    const rows = Array.from({ length: 10 }, (_, index) => [
      `2026-05-26 14:${String(index).padStart(2, "0")}:00`,
      "100",
    ]);
    const flags = detectFlags(
      ["Timestamp", "humidity_pct"],
      rows,
      suggestMappings(["Timestamp", "humidity_pct"]),
    );
    expect(flags.map((flag) => flag.code)).toContain("humidity_stuck");
    expect(flags.some((flag) => flag.code === "saturated_reading_run")).toBe(false);
  });

  it("still flags a two-row soil file that is entirely 100", () => {
    const flags = detectFlags(
      ["Soil Moisture"],
      [["100"], ["100"]],
      suggestMappings(["Soil Moisture"]),
    );
    expect(flags.map((flag) => flag.code)).toEqual(["vwc_stuck"]);
    expect(flags[0].message).toBe(
      "Soil moisture is stuck at 100 — probe likely faulted or submerged.",
    );
  });

  it("adds the run to the source-app preview without replacing the whole-file warning", () => {
    const mixed = [
      "Timestamp,humidity,Soil Moisture (%)",
      ...Array.from({ length: 4 }, (_, index) => `2026-06-03 10:0${index}:00,60,40`),
      ...Array.from(
        { length: 207 },
        (_, index) =>
          `2026-06-03 ${String(11 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00,61,100`,
      ),
      "2026-06-04 00:00:00,58,44",
    ].join("\n");
    const preview = summarizeImportPreview(mixed);
    const soil = preview.warnings.find((warning) => warning.message.includes("207 consecutive"));
    expect(soil?.code).toBe("soil_moisture_stuck");
    expect(soil?.message).toContain("soil_moisture_pct");

    const whole = [
      "Timestamp,Temperature (°F),Humidity (%)",
      ...Array.from(
        { length: 10 },
        (_, index) => `2026-05-26 14:${String(index).padStart(2, "0")}:00,77,100`,
      ),
    ].join("\n");
    const wholePreview = summarizeImportPreview(whole);
    expect(wholePreview.warnings.map((warning) => warning.code)).toContain("humidity_stuck");
    expect(wholePreview.warnings.some((warning) => warning.message.includes("consecutive"))).toBe(
      false,
    );
  });
});

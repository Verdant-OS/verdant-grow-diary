import { describe, expect, it } from "vitest";
import { detectFlags, suggestMappings } from "@/lib/csvSensorPreviewRules";
import { summarizeImportPreview } from "@/lib/sensorImportSourceApps";

describe("saturated reading run boundaries", () => {
  it("treats blank cells as boundaries, not zeros", () => {
    const headers = ["Timestamp", "humidity_pct"];
    const rows = [
      ["2026-06-01T00:00:00Z", "55"],
      ...Array.from({ length: 12 }, (_, index) => [
        `2026-06-01T00:${String(index + 1).padStart(2, "0")}:00Z`,
        "",
      ]),
      ["2026-06-01T00:13:00Z", "56"],
    ];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((flag) => flag.message.includes("consecutive readings at 0%"))).toBe(false);
  });

  it("does not join a 100 run across an n/a cell", () => {
    const headers = ["Timestamp", "humidity_pct"];
    const rows = [
      ["2026-06-01T00:00:00Z", "55"],
      ...Array.from({ length: 6 }, (_, index) => [
        `2026-06-01T01:${String(index).padStart(2, "0")}:00Z`,
        "100",
      ]),
      ["2026-06-01T01:06:00Z", "n/a"],
      ...Array.from({ length: 6 }, (_, index) => [
        `2026-06-01T01:${String(index + 7).padStart(2, "0")}:00Z`,
        "100",
      ]),
      ["2026-06-01T01:13:00Z", "56"],
    ];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(
      flags.filter(
        (flag) => flag.code === "saturated_reading_run" || flag.code === "humidity_stuck",
      ),
    ).toEqual([]);
  });

  it("still reports a later soil run when the first 25 readings are saturated", () => {
    const values = [...Array(25).fill(100), 45, ...Array(130).fill(100), 50];
    const csv = [
      "Timestamp,Temperature (°F),Soil Moisture (%)",
      ...values.map(
        (value, index) =>
          `2026-06-05 ${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00,70,${value}`,
      ),
    ].join("\n");
    const preview = summarizeImportPreview(csv);
    const runs = preview.warnings.filter((warning) => warning.message.includes("consecutive"));
    expect(runs.map((warning) => warning.message)).toEqual([
      expect.stringContaining("25 consecutive readings at 100%"),
      expect.stringContaining("130 consecutive readings at 100%"),
    ]);
    expect(
      preview.warnings.some(
        (warning) => warning.message === "Soil moisture stuck at 100% — verify probe.",
      ),
    ).toBe(false);
  });
});

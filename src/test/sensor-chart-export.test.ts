import { describe, it, expect, vi } from "vitest";
import { buildSensorReadingsCsv, downloadTextFile } from "@/lib/sensorChartExport";
import type { SensorReading } from "@/mock";

const baseReading: SensorReading = {
  ts: "2026-06-01T12:00:00.000Z",
  tentId: "t1",
  temp: 24.5,
  rh: 55.0,
  vpd: 1.23,
  co2: 800,
  soil: 42.0,
  source: "demo",
  status: "needs_review",
  capturedAt: "2026-06-01T12:00:00.000Z",
};

describe("buildSensorReadingsCsv", () => {
  it("returns header only for empty input", () => {
    const csv = buildSensorReadingsCsv([]);
    expect(csv).toBe(
      "Timestamp (UTC),Temperature (°C),Humidity (%),VPD (kPa),CO₂ (ppm),Soil Moisture (%),PPFD (µmol/m²/s),Source,Status,Captured At (UTC)",
    );
  });

  it("formats a single reading correctly", () => {
    const csv = buildSensorReadingsCsv([baseReading]);
    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe(
      "2026-06-01 12:00:00,24.5,55,1.23,800,42,,demo,needs_review,2026-06-01 12:00:00",
    );
  });

  it("formats multiple readings in order", () => {
    const r1: SensorReading = { ...baseReading, ts: "2026-06-01T10:00:00.000Z", temp: 22 };
    const r2: SensorReading = { ...baseReading, ts: "2026-06-01T12:00:00.000Z", temp: 26 };
    const csv = buildSensorReadingsCsv([r1, r2]);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[1]).toMatch(/^2026-06-01 10:00:00,22/);
    expect(lines[2]).toMatch(/^2026-06-01 12:00:00,26/);
  });

  it("normalizes offset timestamps to UTC", () => {
    const r: SensorReading = {
      ...baseReading,
      ts: "2026-06-01T12:00:00-05:00",
      capturedAt: "2026-06-01T12:00:00-05:00",
    };

    const line = buildSensorReadingsCsv([r]).split("\n")[1];

    expect(line).toMatch(/^2026-06-01 17:00:00,/);
    expect(line).toMatch(/,2026-06-01 17:00:00$/);
  });

  it("escapes commas in fields", () => {
    const r: SensorReading = {
      ...baseReading,
      source: "live, manual" as unknown as SensorReading["source"],
    };
    const csv = buildSensorReadingsCsv([r]);
    const line = csv.split("\n")[1];
    expect(line).toContain('"live, manual"');
  });

  it("escapes double quotes in fields", () => {
    const r: SensorReading = {
      ...baseReading,
      status: 'needs_"review' as unknown as SensorReading["status"],
    };
    const csv = buildSensorReadingsCsv([r]);
    const line = csv.split("\n")[1];
    expect(line).toContain('"needs_""review"');
  });

  it("handles null capturedAt as empty string", () => {
    const r: SensorReading = { ...baseReading, capturedAt: "" as unknown as string };
    const csv = buildSensorReadingsCsv([r]);
    const line = csv.split("\n")[1];
    expect(line).toMatch(/,$/); // ends with empty field
  });

  it("leaves invalid timestamps empty instead of crashing the export", () => {
    const r: SensorReading = {
      ...baseReading,
      ts: "not-a-timestamp",
      capturedAt: "also-not-a-timestamp",
    };

    const line = buildSensorReadingsCsv([r]).split("\n")[1];

    expect(line).toMatch(/^,/);
    expect(line).toMatch(/,$/);
  });

  it("rounds integers correctly (co2)", () => {
    const r: SensorReading = { ...baseReading, co2: 850 };
    const csv = buildSensorReadingsCsv([r]);
    const line = csv.split("\n")[1];
    expect(line).toContain(",850,");
  });

  it("keeps compatibility zeroes empty when the source did not observe those metrics", () => {
    const r: SensorReading = {
      ...baseReading,
      temp: 25.56,
      rh: 56,
      vpd: 0,
      co2: 907,
      soil: 55,
      ppfd: 800,
      observedMetrics: ["temp", "rh", "co2", "soil", "ppfd"],
      source: "manual",
      status: "usable",
    };

    const cells = buildSensorReadingsCsv([r]).split("\n")[1].split(",");

    expect(cells.slice(1, 9)).toEqual(["25.56", "56", "", "907", "55", "800", "manual", "usable"]);
  });
});

describe("downloadTextFile", () => {
  it("creates and clicks an anchor element", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");
    const revokeSpy = vi.fn();

    const realAnchor = document.createElement("a");
    const clickSpy = vi.spyOn(realAnchor, "click").mockImplementation(() => undefined);
    createElementSpy.mockImplementation((tag: string) => {
      if (tag === "a") return realAnchor;
      return document.createElement(tag);
    });

    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = revokeSpy;
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = () => "blob:test";

    downloadTextFile("hello,world", "test.csv");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(appendChildSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith("blob:test");

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    URL.revokeObjectURL = originalRevoke;
    URL.createObjectURL = originalCreate;
  });
});

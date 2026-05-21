import { describe, it, expect } from "vitest";
import {
  evaluateAiContextSufficiency,
  DEFAULT_SENSOR_STALE_MS,
  DEFAULT_RECENT_ACTIVITY_MS,
  type AiContextInput,
} from "@/lib/aiContextSufficiencyRules";

const NOW = 1_700_000_000_000;
const recentAt = NOW - 60 * 60 * 1000; // 1h ago
const oldAt = NOW - 30 * 24 * 60 * 60 * 1000; // 30d ago

const completeReal = (over: Partial<AiContextInput> = {}): AiContextInput => ({
  activeGrow: { id: "grow-1" },
  plants: [{ id: "p1", stage: "veg", strain: "Blue Dream", medium: "soil" }],
  recentDiaryEntries: [{ at: recentAt, type: "note" }],
  recentWateringOrFeeding: [{ at: recentAt, type: "water" }],
  recentSensorReadings: [
    { at: recentAt, temp: 24, rh: 55, vpd: 1.0, ph: 6.2, ec: 1.4 },
  ],
  hasPhoto: true,
  sensorMeta: { dataSource: "supabase", isDemoData: false },
  contextMeta: { dataSource: "supabase", isDemoData: false },
  questionKind: "general",
  now: NOW,
  ...over,
});

describe("evaluateAiContextSufficiency", () => {
  it("complete real context => sufficient/high/trusted", () => {
    const r = evaluateAiContextSufficiency(completeReal());
    expect(r.sufficiency).toBe("sufficient");
    expect(r.confidenceCeiling).toBe("high");
    expect(r.trustedForAi).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("no plants => insufficient / low / not trusted", () => {
    const r = evaluateAiContextSufficiency(completeReal({ plants: [] }));
    expect(r.sufficiency).toBe("insufficient");
    expect(r.confidenceCeiling).toBe("low");
    expect(r.trustedForAi).toBe(false);
    expect(r.missing).toContain("plants");
  });

  it("no active grow => insufficient", () => {
    const r = evaluateAiContextSufficiency(completeReal({ activeGrow: null }));
    expect(r.sufficiency).toBe("insufficient");
    expect(r.missing).toContain("active-grow");
  });

  it("missing stage/strain/medium across all plants reports missing", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        plants: [{ id: "p1", stage: null, strain: null, medium: null }],
      }),
    );
    expect(r.missing).toEqual(
      expect.arrayContaining(["plant-stage", "plant-strain", "plant-medium"]),
    );
    expect(r.confidenceCeiling).not.toBe("high");
  });

  it("partial-only missing on one of several plants is a warning, not missing", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        plants: [
          { id: "p1", stage: "veg", strain: "A", medium: "soil" },
          { id: "p2", stage: null, strain: "B", medium: "soil" },
        ],
      }),
    );
    expect(r.missing).not.toContain("plant-stage");
    expect(r.warnings).toContain("partial-plant-stage");
  });

  it("no recent diary / watering / feeding lowers confidence", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        recentDiaryEntries: [{ at: oldAt }],
        recentWateringOrFeeding: [{ at: oldAt }],
      }),
    );
    expect(r.missing).toEqual(
      expect.arrayContaining(["recent-diary", "recent-watering-or-feeding"]),
    );
    expect(r.confidenceCeiling).not.toBe("high");
  });

  it("stale sensor context caps ceiling and emits warning", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        recentSensorReadings: [
          { at: NOW - DEFAULT_SENSOR_STALE_MS - 1000, temp: 24, rh: 55, vpd: 1 },
        ],
      }),
    );
    expect(r.warnings).toContain("sensor-reading:stale");
    expect(r.confidenceCeiling).not.toBe("high");
  });

  it("demo/mock sensor context caps ceiling at low and is not trusted", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        sensorMeta: { dataSource: "mock", isDemoData: true },
      }),
    );
    expect(r.confidenceCeiling).toBe("low");
    expect(r.trustedForAi).toBe(false);
    expect(r.warnings).toContain("sensor-source:demo");
  });

  it("mixed data context caps ceiling at medium at most", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        sensorMeta: { dataSource: "mixed", isDemoData: true },
      }),
    );
    expect(["medium", "low"]).toContain(r.confidenceCeiling);
    expect(r.confidenceCeiling).not.toBe("high");
  });

  it("unavailable context is insufficient", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        sensorMeta: { dataSource: "unavailable", isDemoData: false },
      }),
    );
    expect(r.sufficiency).toBe("insufficient");
    expect(r.confidenceCeiling).toBe("low");
    expect(r.trustedForAi).toBe(false);
  });

  it("visual diagnosis without photo flags missing photo", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({ questionKind: "visual-diagnosis", hasPhoto: false }),
    );
    expect(r.missing).toContain("visual:photo");
    expect(r.confidenceCeiling).not.toBe("high");
  });

  it("nutrient question without pH/EC flags both", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        questionKind: "nutrient",
        recentSensorReadings: [{ at: recentAt, temp: 24, rh: 55, vpd: 1 }],
      }),
    );
    expect(r.missing).toEqual(
      expect.arrayContaining(["nutrient:ph", "nutrient:ec"]),
    );
  });

  it("environment question without temp/RH/VPD flags all three", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        questionKind: "environment",
        recentSensorReadings: [{ at: recentAt }],
      }),
    );
    expect(r.missing).toEqual(
      expect.arrayContaining(["env:temp", "env:rh", "env:vpd"]),
    );
  });

  it("invalid sensor timestamp produces warning, not silent drop", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        recentSensorReadings: [
          { at: "not-a-date", temp: 24, rh: 55, vpd: 1 },
          { at: recentAt, temp: 24, rh: 55, vpd: 1 },
        ],
      }),
    );
    expect(r.warnings).toContain("sensor-reading:invalid-timestamp");
  });

  it("is deterministic for identical input", () => {
    const a = evaluateAiContextSufficiency(completeReal());
    const b = evaluateAiContextSufficiency(completeReal());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not leak raw plant/sensor payloads into messages", () => {
    const r = evaluateAiContextSufficiency(
      completeReal({
        plants: [
          {
            id: "secret-plant-id",
            stage: "veg",
            strain: "Secret-Strain-X",
            medium: "soil",
          },
        ],
        recentSensorReadings: [
          { at: recentAt, temp: 99.123, rh: 12.34, vpd: 5.67, ph: 7.7, ec: 9.9 },
        ],
      }),
    );
    const blob = JSON.stringify([r.missing, r.warnings, r.reasons]);
    expect(blob).not.toMatch(/secret-plant-id/);
    expect(blob).not.toMatch(/Secret-Strain-X/);
    expect(blob).not.toMatch(/99\.123|12\.34|5\.67|7\.7|9\.9/);
  });

  it("handles null/undefined input safely", () => {
    const r = evaluateAiContextSufficiency(null);
    expect(r.sufficiency).toBe("insufficient");
    expect(r.confidenceCeiling).toBe("low");
    expect(r.trustedForAi).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(["active-grow", "plants"]));
  });

  it("exports sensible defaults for stale and recent thresholds", () => {
    expect(DEFAULT_SENSOR_STALE_MS).toBeGreaterThan(0);
    expect(DEFAULT_RECENT_ACTIVITY_MS).toBeGreaterThan(DEFAULT_SENSOR_STALE_MS);
  });
});

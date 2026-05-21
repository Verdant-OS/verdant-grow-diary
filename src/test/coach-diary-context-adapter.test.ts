/**
 * Tests for the coach context adapter that bridges normalized diary entries
 * into the AI context sufficiency rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptDiaryForAiContext } from "@/lib/coachContextAdapter";
import {
  evaluateAiContextSufficiency,
  type AiContextInput,
} from "@/lib/aiContextSufficiencyRules";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");

const NOW = 1_700_000_000_000;
const recentIso = new Date(NOW - 60 * 60 * 1000).toISOString();

const baseInput = (over: Partial<AiContextInput> = {}): AiContextInput => ({
  activeGrow: { id: "grow-1" },
  plants: [{ id: "p1", stage: "veg", strain: "Blue Dream", medium: "soil" }],
  recentDiaryEntries: [],
  recentWateringOrFeeding: [],
  recentSensorReadings: [],
  hasPhoto: false,
  sensorMeta: { dataSource: "supabase", isDemoData: false },
  contextMeta: { dataSource: "supabase", isDemoData: false },
  questionKind: "general",
  now: NOW,
  ...over,
});

describe("adaptDiaryForAiContext", () => {
  it("treats valid normalized diary entries as useful context", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "watering",
          details: {
            ph: 6.2,
            ec: 1.4,
            watering_amount_ml: 500,
          },
        },
      ],
      now: NOW,
    });
    expect(adapted.recentDiaryEntries.length).toBe(1);
    expect(adapted.recentWateringOrFeeding.length).toBe(1);
    expect(adapted.diaryDerivedSensors.length).toBe(1);
    expect(adapted.diaryDerivedSensors[0].ph).toBe(6.2);
    expect(adapted.diaryDerivedSensors[0].ec).toBe(1.4);
    expect(adapted.malformedDiaryCount).toBe(0);
  });

  it("counts malformed details and drops them from recent context", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "watering",
          details: "not-json{",
        },
        // Completely malformed row — fails normalization entirely.
        null,
      ],
      now: NOW,
    });
    expect(adapted.recentDiaryEntries.length).toBe(0);
    expect(adapted.recentWateringOrFeeding.length).toBe(0);
    expect(adapted.malformedDiaryCount).toBeGreaterThan(0);
  });

  it("does not derive sensor pH/EC from invalid values", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "feeding",
          details: { ph: 99, ec: -2 },
        },
      ],
      now: NOW,
    });
    // Out-of-range pH/EC are dropped by normalization, so no useful sensor.
    expect(adapted.diaryDerivedSensors.length).toBe(0);
    // Entry itself becomes invalid for AI context due to "*:out-of-range".
    // (out-of-range is a warning, not :invalid, so entry is still valid;
    //  but pH/EC are absent.)
    expect(
      adapted.diaryDerivedSensors.find((s) => s.ph != null || s.ec != null),
    ).toBeUndefined();
  });

  it("flags valid photo from diary entry", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "note",
          photo_url: "https://example.com/p.jpg",
        },
      ],
      now: NOW,
    });
    expect(adapted.hasDiaryPhoto).toBe(true);
  });

  it("returns empty result for empty/missing input", () => {
    const adapted = adaptDiaryForAiContext({ rawDiaryEntries: [] });
    expect(adapted.recentDiaryEntries).toEqual([]);
    expect(adapted.recentWateringOrFeeding).toEqual([]);
    expect(adapted.diaryDerivedSensors).toEqual([]);
    expect(adapted.hasDiaryPhoto).toBe(false);
    expect(adapted.malformedDiaryCount).toBe(0);
  });
});

describe("evaluateAiContextSufficiency with adapted diary context", () => {
  it("valid pH/EC from diary improves nutrient-question sufficiency", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "feeding",
          details: { ph: 6.1, ec: 1.5, watering_amount_ml: 500 },
        },
      ],
      now: NOW,
    });
    const result = evaluateAiContextSufficiency(
      baseInput({
        questionKind: "nutrient",
        recentDiaryEntries: adapted.recentDiaryEntries,
        recentWateringOrFeeding: adapted.recentWateringOrFeeding,
        recentSensorReadings: adapted.diaryDerivedSensors,
      }),
    );
    expect(result.missing).not.toContain("nutrient:ph");
    expect(result.missing).not.toContain("nutrient:ec");
    expect(result.missing).not.toContain("recent-watering-or-feeding");
  });

  it("invalid pH/EC in diary does not improve nutrient sufficiency", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "feeding",
          details: { ph: "not-a-number", ec: {} },
        },
      ],
      now: NOW,
    });
    const result = evaluateAiContextSufficiency(
      baseInput({
        questionKind: "nutrient",
        recentDiaryEntries: adapted.recentDiaryEntries,
        recentWateringOrFeeding: adapted.recentWateringOrFeeding,
        recentSensorReadings: adapted.diaryDerivedSensors,
      }),
    );
    expect(result.missing).toContain("nutrient:ph");
    expect(result.missing).toContain("nutrient:ec");
  });

  it("malformed diary details lead to limited/insufficient sufficiency", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "watering",
          details: "{not-json",
        },
      ],
      now: NOW,
    });
    const result = evaluateAiContextSufficiency(
      baseInput({
        recentDiaryEntries: adapted.recentDiaryEntries,
        recentWateringOrFeeding: adapted.recentWateringOrFeeding,
      }),
    );
    expect(result.sufficiency).not.toBe("sufficient");
    expect(result.missing).toContain("recent-diary");
    expect(result.missing).toContain("recent-watering-or-feeding");
  });

  it("valid watering entry counts toward recent watering/feeding", () => {
    const adapted = adaptDiaryForAiContext({
      rawDiaryEntries: [
        {
          id: "d1",
          entry_at: recentIso,
          entry_type: "watering",
          details: { watering_amount_ml: 750 },
        },
      ],
      now: NOW,
    });
    const result = evaluateAiContextSufficiency(
      baseInput({
        recentDiaryEntries: adapted.recentDiaryEntries,
        recentWateringOrFeeding: adapted.recentWateringOrFeeding,
      }),
    );
    expect(result.missing).not.toContain("recent-watering-or-feeding");
    expect(result.missing).not.toContain("recent-diary");
  });

  it("missing diary context still surfaces warnings", () => {
    const result = evaluateAiContextSufficiency(
      baseInput({
        recentDiaryEntries: [],
        recentWateringOrFeeding: [],
      }),
    );
    expect(result.missing).toContain("recent-diary");
    expect(result.missing).toContain("recent-watering-or-feeding");
    expect(result.sufficiency).not.toBe("sufficient");
  });
});

describe("Coach page wiring of normalized diary context", () => {
  it("imports the coach context adapter", () => {
    expect(COACH).toMatch(/from\s+["']@\/lib\/coachContextAdapter["']/);
    expect(COACH).toMatch(/adaptDiaryForAiContext\s*\(/);
  });

  it("feeds adapted diary signals into evaluateAiContextSufficiency", () => {
    expect(COACH).toMatch(/diaryAdapted\.recentDiaryEntries/);
    expect(COACH).toMatch(/diaryAdapted\.recentWateringOrFeeding/);
    expect(COACH).toMatch(/diaryAdapted\.diaryDerivedSensors/);
  });

  it("does not change ai-coach edge function payload shape", () => {
    // Still invokes ai-coach with the same body fields.
    expect(COACH).toMatch(
      /functions\.invoke\(\s*["']ai-coach["'][\s\S]*?\{\s*mode,\s*growId:/,
    );
  });
});

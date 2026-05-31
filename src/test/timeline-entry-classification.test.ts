/**
 * Shared timeline event classification guardrails.
 *
 * Locks in:
 *  - `classifyTimelineEntry` is the single source of truth for mapping a
 *    diary/QuickLog event to a filter bucket.
 *  - Existing QuickLog event types keep their previous bucket.
 *  - New event types (harvest, transplant, measurement, reminder)
 *    classify to dedicated buckets, not "notes".
 *  - Unknown / null / empty event types fall back to "notes".
 *  - Photo source wins regardless of eventType.
 *  - Grow Timeline (`src/pages/Timeline.tsx`) and Plant Relative Timeline
 *    (`src/components/PlantRelativeTimelineSection.tsx`) both depend on
 *    the shared helper — no local mapping tables.
 *  - No service_role / device-control / automation strings leak in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyTimelineEntry,
  MEASUREMENT_DETAIL_KEYS,
  type TimelineFilterCategory,
} from "@/lib/timelineEntryClassification";
import { classifyRelativeTimelineFilter } from "@/lib/relativeTimelineProjectionRules";

const ROOT = resolve(__dirname, "../..");
const TIMELINE_PAGE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const PLANT_TIMELINE = readFileSync(
  resolve(ROOT, "src/components/PlantRelativeTimelineSection.tsx"),
  "utf8",
);
const RULES = readFileSync(
  resolve(ROOT, "src/lib/relativeTimelineProjectionRules.ts"),
  "utf8",
);

describe("classifyTimelineEntry — existing QuickLog event types", () => {
  const cases: Array<[string, TimelineFilterCategory]> = [
    ["watering", "watering"],
    ["feeding", "feeding"],
    ["training", "training"],
    ["defoliation", "training"],
    ["symptoms", "symptoms"],
    ["pest_disease", "symptoms"],
    ["diagnosis", "symptoms"],
    ["photo", "photos"],
    ["observation", "notes"],
    ["note", "notes"],
  ];
  it.each(cases)("eventType=%s → %s", (eventType, expected) => {
    expect(classifyTimelineEntry({ eventType, source: "note" })).toBe(expected);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(classifyTimelineEntry({ eventType: " Watering ", source: "note" })).toBe(
      "watering",
    );
    expect(classifyTimelineEntry({ eventType: "FEEDING", source: "note" })).toBe(
      "feeding",
    );
  });
});

describe("classifyTimelineEntry — new event types", () => {
  const cases: Array<[string, TimelineFilterCategory]> = [
    ["harvest", "harvest"],
    ["dry", "harvest"],
    ["drying", "harvest"],
    ["cure", "harvest"],
    ["curing", "harvest"],
    ["transplant", "transplant"],
    ["repot", "transplant"],
    ["measurement", "measurement"],
    ["manual_snapshot", "measurement"],
    ["sensor_snapshot", "measurement"],
    ["reminder", "reminder"],
    ["action_followup", "reminder"],
  ];
  it.each(cases)("eventType=%s → %s", (eventType, expected) => {
    expect(classifyTimelineEntry({ eventType, source: "note" })).toBe(expected);
  });
});

describe("classifyTimelineEntry — fallback contract", () => {
  it("unknown event types fall back to notes", () => {
    expect(classifyTimelineEntry({ eventType: "wat-a-mango", source: "note" })).toBe(
      "notes",
    );
  });
  it("empty / null / undefined event types fall back to notes", () => {
    expect(classifyTimelineEntry({ eventType: "", source: "note" })).toBe("notes");
    expect(classifyTimelineEntry({ eventType: null, source: "note" })).toBe("notes");
    expect(classifyTimelineEntry({ eventType: undefined, source: "note" })).toBe(
      "notes",
    );
    expect(classifyTimelineEntry(null)).toBe("notes");
    expect(classifyTimelineEntry(undefined)).toBe("notes");
  });
});

describe("classifyTimelineEntry — photo source wins", () => {
  it("photo source wins over any eventType", () => {
    for (const eventType of [
      "watering",
      "feeding",
      "harvest",
      "reminder",
      "measurement",
      "unknown-thing",
      "",
    ]) {
      expect(classifyTimelineEntry({ eventType, source: "photo" })).toBe("photos");
    }
  });
});

describe("classifyRelativeTimelineFilter delegates to shared helper", () => {
  it("returns the same bucket as classifyTimelineEntry for every case", () => {
    const inputs: Array<{ eventType: string; source: "note" | "photo" | "sensor" }> = [
      { eventType: "watering", source: "note" },
      { eventType: "harvest", source: "note" },
      { eventType: "reminder", source: "note" },
      { eventType: "measurement", source: "note" },
      { eventType: "transplant", source: "note" },
      { eventType: "unknown", source: "note" },
      { eventType: "", source: "note" },
      { eventType: "anything", source: "photo" },
    ];
    for (const i of inputs) {
      expect(classifyRelativeTimelineFilter(i)).toBe(classifyTimelineEntry(i));
    }
  });
});

describe("Shared helper wiring — no duplicated classification tables", () => {
  it("Timeline.tsx imports MEASUREMENT_DETAIL_KEYS from the shared helper", () => {
    expect(TIMELINE_PAGE).toMatch(
      /from\s+["']@\/lib\/timelineEntryClassification["']/,
    );
    expect(TIMELINE_PAGE).toMatch(/MEASUREMENT_DETAIL_KEYS/);
  });

  it("Timeline.tsx does not define a local MEASUREMENT_KEYS table", () => {
    expect(TIMELINE_PAGE).not.toMatch(/const\s+MEASUREMENT_KEYS\s*=/);
  });

  it("Timeline.tsx does not redefine the symptom/training/harvest/transplant sets", () => {
    for (const re of [
      /SYMPTOM_EVENT_TYPES\s*=/,
      /TRAINING_EVENT_TYPES\s*=/,
      /HARVEST_EVENT_TYPES\s*=/,
      /TRANSPLANT_EVENT_TYPES\s*=/,
      /MEASUREMENT_EVENT_TYPES\s*=/,
      /REMINDER_EVENT_TYPES\s*=/,
    ]) {
      expect(TIMELINE_PAGE).not.toMatch(re);
    }
  });

  it("PlantRelativeTimelineSection.tsx contains no local mapping tables", () => {
    for (const re of [
      /SYMPTOM_EVENT_TYPES\s*=/,
      /TRAINING_EVENT_TYPES\s*=/,
      /HARVEST_EVENT_TYPES\s*=/,
      /TRANSPLANT_EVENT_TYPES\s*=/,
      /MEASUREMENT_EVENT_TYPES\s*=/,
      /REMINDER_EVENT_TYPES\s*=/,
      /MEASUREMENT_KEYS\s*=/,
    ]) {
      expect(PLANT_TIMELINE).not.toMatch(re);
    }
  });

  it("relativeTimelineProjectionRules imports the shared helper", () => {
    expect(RULES).toMatch(/from\s+["']@\/lib\/timelineEntryClassification["']/);
    expect(RULES).toMatch(/classifyTimelineEntry/);
  });

  it("MEASUREMENT_DETAIL_KEYS still covers the legacy detail flags", () => {
    for (const k of ["ph", "ec", "runoff", "watering"]) {
      expect(MEASUREMENT_DETAIL_KEYS.has(k)).toBe(true);
    }
  });
});

describe("Static safety — no automation, device control, or service_role on the classification path", () => {
  const SOURCES: Array<readonly [string, string]> = [
    ["timelineEntryClassification.ts", readFileSync(
      resolve(ROOT, "src/lib/timelineEntryClassification.ts"),
      "utf8",
    )],
    ["relativeTimelineProjectionRules.ts", RULES],
    ["Timeline.tsx", TIMELINE_PAGE],
    ["PlantRelativeTimelineSection.tsx", PLANT_TIMELINE],
  ];
  const FORBIDDEN = [
    /service_role/i,
    /mqtt/i,
    /home[\s_-]?assistant/i,
    /\brelay\b/i,
    /\bactuator\b/i,
    /webhook/i,
    /device[_-]?command/i,
    /auto[_-]?(approve|reject|cancel|execute)/i,
    /sensor-ingest/i,
    /pi[\s_-]?ingest/i,
  ];
  for (const [name, src] of SOURCES) {
    it(`${name} has none of the forbidden strings`, () => {
      for (const re of FORBIDDEN) expect(src).not.toMatch(re);
    });
  }

  it("the shared helper performs no writes / RPC", () => {
    const src = readFileSync(
      resolve(ROOT, "src/lib/timelineEntryClassification.ts"),
      "utf8",
    );
    for (const re of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/]) {
      expect(src).not.toMatch(re);
    }
  });
});

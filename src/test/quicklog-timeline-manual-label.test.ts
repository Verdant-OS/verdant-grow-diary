/**
 * QuickLog → Timeline visibility guardrails.
 *
 * QuickLog writes a `sensor_snapshot` payload under `diary_entries.details`.
 * These tests lock in:
 *  - the Grow Timeline reads `sensor_snapshot` (not the legacy `sensor` key),
 *    so QuickLog-attached snapshots actually render
 *  - sensor snapshots are labeled "Manual", never "Live", on every diary
 *    rendering surface
 *  - no diary rendering surface labels timeline rows as "Live" data
 *  - duplicated category mapping tables are not introduced in the page JSX
 *  - the QuickLog→timeline path performs no writes / automation /
 *    service_role / device control
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyRelativeTimelineFilter,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

const ROOT = resolve(__dirname, "../..");
const TIMELINE_PAGE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const PLANT_TIMELINE = readFileSync(
  resolve(ROOT, "src/components/PlantRelativeTimelineSection.tsx"),
  "utf8",
);
const DIARY_BADGES = readFileSync(
  resolve(ROOT, "src/components/DiaryEntryBadges.tsx"),
  "utf8",
);
const TIMELINE_RULES = readFileSync(
  resolve(ROOT, "src/lib/relativeTimelineProjectionRules.ts"),
  "utf8",
);

describe("Grow Timeline · sensor_snapshot wiring", () => {
  it("reads the canonical `sensor_snapshot` key QuickLog writes", () => {
    expect(TIMELINE_PAGE).toMatch(/details\?\.sensor_snapshot/);
  });

  it("hides both `sensor` and `sensor_snapshot` from the misc extras strip", () => {
    expect(TIMELINE_PAGE).toMatch(
      /HIDDEN\s*=\s*\[[^\]]*"sensor"[^\]]*"sensor_snapshot"[^\]]*\]/,
    );
  });

  it("labels the snapshot chip 'Manual snapshot' (never 'Live')", () => {
    expect(TIMELINE_PAGE).toMatch(/Manual snapshot/);
    expect(TIMELINE_PAGE).not.toMatch(/>Snapshot</);
  });
});

describe("Plant Relative Timeline · Manual sensor label", () => {
  it("labels the sensor source as 'Manual snapshot' in the shared rules helper, not 'Sensor' or 'Live'", () => {
    expect(TIMELINE_RULES).toMatch(/sensor:\s*"Manual snapshot"/);
    expect(TIMELINE_RULES).not.toMatch(/sensor:\s*"Sensor"/);
    expect(TIMELINE_RULES).not.toMatch(/sensor:\s*"Live"/);
    // The component must not re-introduce a local override.
    expect(PLANT_TIMELINE).not.toMatch(/sensor:\s*"(Sensor|Live)"/);
  });
});

describe("DiaryEntryBadges · Manual snapshot label", () => {
  it("labels the sensor-snapshot tag as 'Manual snapshot'", () => {
    expect(DIARY_BADGES).toMatch(/"sensor-snapshot":\s*"Manual snapshot"/);
    expect(DIARY_BADGES).not.toMatch(/"sensor-snapshot":\s*"Sensor"/);
    expect(DIARY_BADGES).not.toMatch(/"sensor-snapshot":\s*"Live"/);
  });
});

describe("No diary rendering surface labels rows as 'Live'", () => {
  for (const [name, src] of [
    ["Timeline.tsx", TIMELINE_PAGE],
    ["PlantRelativeTimelineSection.tsx", PLANT_TIMELINE],
    ["DiaryEntryBadges.tsx", DIARY_BADGES],
  ] as const) {
    it(`${name} has no "Live" label`, () => {
      expect(src).not.toMatch(/>\s*Live\s*</);
      expect(src).not.toMatch(/"Live sensor"/);
    });
  }
});

describe("classifyRelativeTimelineFilter · fallback contract", () => {
  const base = {
    id: "x",
    title: "t",
    occurredAt: null,
    occurredAtLabel: "",
    plantDay: null,
    stageDay: null,
    stagePreset: null,
    plantId: null,
    tentId: null,
  } as const;

  it("classifies QuickLog event types into their buckets", () => {
    const cases: Array<[string, string]> = [
      ["watering", "watering"],
      ["feeding", "feeding"],
      ["training", "training"],
      ["defoliation", "training"],
      ["symptoms", "symptoms"],
      ["pest_disease", "symptoms"],
      ["diagnosis", "symptoms"],
      ["photo", "photos"],
      ["observation", "notes"],
    ];
    for (const [eventType, bucket] of cases) {
      const item: RelativeTimelineItem = {
        ...base,
        eventType,
        source: "note",
      };
      expect(classifyRelativeTimelineFilter(item)).toBe(bucket);
    }
  });

  it("photo source wins regardless of event type", () => {
    expect(
      classifyRelativeTimelineFilter({ ...base, eventType: "", source: "photo" }),
    ).toBe("photos");
  });

  it("unknown / null event types fall back to notes", () => {
    expect(
      classifyRelativeTimelineFilter({ ...base, eventType: "wat-a-mango", source: "note" }),
    ).toBe("notes");
    expect(
      classifyRelativeTimelineFilter({
        ...base,
        eventType: null as unknown as string,
        source: "note",
      }),
    ).toBe("notes");
    expect(classifyRelativeTimelineFilter(null)).toBe("notes");
  });
});

describe("Static safety · no writes/automation/device control on rendering surfaces", () => {
  for (const [name, src] of [
    ["Timeline.tsx", TIMELINE_PAGE],
    ["PlantRelativeTimelineSection.tsx", PLANT_TIMELINE],
    ["DiaryEntryBadges.tsx", DIARY_BADGES],
  ] as const) {
    it(`${name} has no service_role / device-control / automation strings`, () => {
      for (const re of [
        /service_role/i,
        /mqtt/i,
        /home[\s_-]?assistant/i,
        /\brelay\b/i,
        /\bactuator\b/i,
        /webhook/i,
        /device[_-]?command/i,
        /auto[_-]?(approve|reject|cancel|execute)/i,
        /pi[\s_-]?ingest/i,
        /sensor-ingest/i,
      ]) {
        expect(src).not.toMatch(re);
      }
    });
  }

  it("PlantRelativeTimelineSection performs no writes", () => {
    for (const re of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/]) {
      expect(PLANT_TIMELINE).not.toMatch(re);
    }
  });

  it("PlantRelativeTimelineSection does not duplicate the filter mapping table", () => {
    // Source-of-truth lives in relativeTimelineProjectionRules.ts.
    expect(PLANT_TIMELINE).not.toMatch(/SYMPTOM_EVENT_TYPES/);
    expect(PLANT_TIMELINE).not.toMatch(/TRAINING_EVENT_TYPES/);
    expect(PLANT_TIMELINE).toMatch(/classifyRelativeTimelineFilter|filterRelativeTimelineItems/);
  });
});

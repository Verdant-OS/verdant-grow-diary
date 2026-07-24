import { describe, expect, it } from "vitest";
import {
  buildGuidedActionChecklist,
  SENSOR_FRESHNESS_MS,
  WATERING_CADENCE_MS,
  PHOTO_CADENCE_MS,
  FLOWER_TRICHOME_CHECK_CADENCE_MS,
  type BuildGuidedActionChecklistInput,
  type GuidedChecklistPlant,
  type GuidedChecklistTent,
} from "@/lib/guidedActionChecklistRules";
import type { NormalizedDiaryEntry } from "@/lib/diaryEntryRules";

const NOW = Date.parse("2026-07-23T12:00:00Z");
const GROW = "grow-a";

function makeInput(
  overrides: Partial<BuildGuidedActionChecklistInput> = {},
): BuildGuidedActionChecklistInput {
  return {
    now: NOW,
    scopedGrowId: GROW,
    plants: [],
    tents: [],
    diaryEntries: [],
    latestReadingByTent: {},
    openAlerts: [],
    dismissedIds: [],
    ...overrides,
  };
}

function entry(
  partial: Partial<NormalizedDiaryEntry> & {
    id: string;
    plantId: string | null;
    eventType: string;
    createdAt: string | null;
  },
): NormalizedDiaryEntry {
  return {
    growId: GROW,
    tentId: null,
    stage: null,
    note: "",
    photoUrl: null,
    createdAtLabel: partial.createdAt ?? "",
    dayOfGrow: null,
    weekOfGrow: null,
    details: {},
    warnings: [],
    isValidForAiContext: true,
    ...partial,
  } as NormalizedDiaryEntry;
}

const PLANT_A: GuidedChecklistPlant = {
  id: "p1",
  name: "Alpha",
  tentId: "t1",
  stage: "veg",
};
const PLANT_FLOWER: GuidedChecklistPlant = {
  id: "p2",
  name: "Bravo",
  tentId: "t1",
  stage: "flower",
};
const TENT_1: GuidedChecklistTent = { id: "t1", name: "Tent 1" };

describe("buildGuidedActionChecklist", () => {
  it("returns empty when there is nothing to log and sensor is fresh", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        tents: [TENT_1],
        latestReadingByTent: {
          t1: {
            capturedAt: new Date(NOW - 5 * 60_000).toISOString(),
            source: "live",
            quality: "ok",
          },
        },
        diaryEntries: [
          entry({
            id: "e1",
            plantId: "p1",
            eventType: "watering",
            createdAt: new Date(NOW - 60 * 60_000).toISOString(),
          }),
          entry({
            id: "e2",
            plantId: "p1",
            eventType: "photo",
            createdAt: new Date(NOW - 60 * 60_000).toISOString(),
            photoUrl: "https://x/y.jpg",
          }),
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("flags a tent with no reading as sensor_context", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        tents: [TENT_1],
        latestReadingByTent: { t1: null },
        diaryEntries: [
          entry({
            id: "e1",
            plantId: "p1",
            eventType: "watering",
            createdAt: new Date(NOW - 60 * 60_000).toISOString(),
          }),
          entry({
            id: "e2",
            plantId: "p1",
            eventType: "photo",
            createdAt: new Date(NOW - 60 * 60_000).toISOString(),
            photoUrl: "u",
          }),
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("sensor_context");
    expect(items[0].id).toBe("sensor:t1");
    expect(items[0].tentId).toBe("t1");
  });

  it("treats demo/stale/invalid sensor sources as not fresh", () => {
    const capturedAt = new Date(NOW - 60_000).toISOString();
    for (const source of ["demo", "stale", "invalid", "csv"]) {
      const items = buildGuidedActionChecklist(
        makeInput({
          tents: [TENT_1],
          latestReadingByTent: {
            t1: { capturedAt, source, quality: "ok" },
          },
        }),
      );
      expect(items.some((i) => i.kind === "sensor_context")).toBe(true);
    }
  });

  it("treats a reading older than the freshness window as not fresh", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        tents: [TENT_1],
        latestReadingByTent: {
          t1: {
            capturedAt: new Date(NOW - SENSOR_FRESHNESS_MS - 60_000).toISOString(),
            source: "live",
            quality: "ok",
          },
        },
      }),
    );
    expect(items.some((i) => i.kind === "sensor_context")).toBe(true);
  });

  it("emits cadence items for missing watering and photo", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        latestReadingByTent: {},
      }),
    );
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual(["cadence:photo:p1", "cadence:water:p1"]);
  });

  it("emits cadence items when the last log is beyond the window", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        diaryEntries: [
          entry({
            id: "e1",
            plantId: "p1",
            eventType: "watering",
            createdAt: new Date(NOW - WATERING_CADENCE_MS - 60_000).toISOString(),
          }),
          entry({
            id: "e2",
            plantId: "p1",
            eventType: "photo",
            createdAt: new Date(NOW - PHOTO_CADENCE_MS - 60_000).toISOString(),
            photoUrl: "u",
          }),
        ],
      }),
    );
    expect(items.some((i) => i.id === "cadence:water:p1")).toBe(true);
    expect(items.some((i) => i.id === "cadence:photo:p1")).toBe(true);
  });

  it("adds a flower-stage trichome-check prompt when overdue", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_FLOWER],
        diaryEntries: [
          entry({
            id: "e1",
            plantId: "p2",
            eventType: "watering",
            createdAt: new Date(NOW - 60_000).toISOString(),
          }),
          entry({
            id: "e2",
            plantId: "p2",
            eventType: "photo",
            createdAt: new Date(NOW - 60_000).toISOString(),
            photoUrl: "u",
          }),
        ],
      }),
    );
    expect(items.some((i) => i.id === "stage:trichome:p2")).toBe(true);
  });

  it("suppresses trichome prompt when a recent trichome note exists", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_FLOWER],
        diaryEntries: [
          entry({
            id: "e1",
            plantId: "p2",
            eventType: "watering",
            createdAt: new Date(NOW - 60_000).toISOString(),
          }),
          entry({
            id: "e2",
            plantId: "p2",
            eventType: "photo",
            createdAt: new Date(NOW - 60_000).toISOString(),
            photoUrl: "u",
          }),
          entry({
            id: "e3",
            plantId: "p2",
            eventType: "observation",
            createdAt: new Date(
              NOW - FLOWER_TRICHOME_CHECK_CADENCE_MS + 60_000,
            ).toISOString(),
            note: "Trichomes mostly cloudy, some clear.",
          }),
        ],
      }),
    );
    expect(items.some((i) => i.id === "stage:trichome:p2")).toBe(false);
  });

  it("orders alerts by severity ahead of everything else", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        tents: [TENT_1],
        latestReadingByTent: { t1: null },
        openAlerts: [
          {
            id: "a1",
            title: "High tent temperature",
            severity: "critical",
            plantId: null,
            tentId: "t1",
          },
          {
            id: "a2",
            title: "Humidity watch",
            severity: "watch",
            plantId: null,
            tentId: "t1",
          },
        ],
      }),
    );
    expect(items[0].id).toBe("alert:a1");
    expect(items[0].priority).toBe(1);
    expect(items.map((i) => i.kind)[0]).toBe("alert_followup");
  });

  it("filters out dismissed ids", () => {
    const items = buildGuidedActionChecklist(
      makeInput({
        plants: [PLANT_A],
        tents: [TENT_1],
        latestReadingByTent: { t1: null },
        dismissedIds: ["sensor:t1"],
      }),
    );
    expect(items.every((i) => i.id !== "sensor:t1")).toBe(true);
  });

  it("caps output at maxItems", () => {
    const plants: GuidedChecklistPlant[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `Plant ${i}`,
      tentId: "t1",
      stage: "veg",
    }));
    const items = buildGuidedActionChecklist(
      makeInput({
        plants,
        tents: [TENT_1],
        latestReadingByTent: { t1: null },
        maxItems: 3,
      }),
    );
    expect(items).toHaveLength(3);
  });

  it("is deterministic across repeated invocations", () => {
    const input = makeInput({
      plants: [PLANT_A, PLANT_FLOWER],
      tents: [TENT_1],
      latestReadingByTent: { t1: null },
      openAlerts: [
        {
          id: "a1",
          title: "High tent temperature",
          severity: "critical",
          plantId: null,
          tentId: "t1",
        },
      ],
    });
    const a = buildGuidedActionChecklist(input).map((i) => i.id);
    const b = buildGuidedActionChecklist(input).map((i) => i.id);
    expect(a).toEqual(b);
  });
});

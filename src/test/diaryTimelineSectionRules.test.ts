import { describe, it, expect } from "vitest";
import {
  buildDiaryTimelineSections,
  classifyDiaryTimelineEntry,
  DIARY_TIMELINE_SECTION_ORDER,
  DIARY_TIMELINE_SECTION_EMPTY_COPY,
  DIARY_TIMELINE_SECTION_LABELS,
} from "@/lib/diaryTimelineSectionRules";

describe("classifyDiaryTimelineEntry", () => {
  it("watering event → watering", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "watering" })).toBe(
      "watering",
    );
  });
  it("feeding event → feeding", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "feeding" })).toBe(
      "feeding",
    );
  });
  it("training / defoliation → training", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "training" })).toBe(
      "training",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "defoliation" })).toBe(
      "training",
    );
  });
  it("photo event or photo source → photos", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "photo" })).toBe("photos");
    expect(
      classifyDiaryTimelineEntry({ eventType: "note", source: "photo" }),
    ).toBe("photos");
  });
  it("symptoms / diagnosis → diagnoses", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "symptoms" })).toBe(
      "diagnoses",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "diagnosis" })).toBe(
      "diagnoses",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "pest_disease" })).toBe(
      "diagnoses",
    );
  });
  it("harvest / dry / cure → harvest", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "harvest" })).toBe(
      "harvest",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "drying" })).toBe(
      "harvest",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "curing" })).toBe(
      "harvest",
    );
  });
  it("unknown / null / missing → other (never guessed)", () => {
    expect(classifyDiaryTimelineEntry(null)).toBe("other");
    expect(classifyDiaryTimelineEntry(undefined)).toBe("other");
    expect(classifyDiaryTimelineEntry({})).toBe("other");
    expect(classifyDiaryTimelineEntry({ eventType: "note" })).toBe("other");
    expect(classifyDiaryTimelineEntry({ eventType: "something-vague" })).toBe(
      "other",
    );
  });
  it("sensor snapshot / measurement → other (not 'healthy/actionable')", () => {
    expect(classifyDiaryTimelineEntry({ eventType: "measurement" })).toBe(
      "other",
    );
    expect(classifyDiaryTimelineEntry({ eventType: "sensor_snapshot" })).toBe(
      "other",
    );
    expect(
      classifyDiaryTimelineEntry({ eventType: "note", source: "sensor" }),
    ).toBe("other");
  });
});

describe("buildDiaryTimelineSections", () => {
  it("returns all seven sections in fixed order, even for empty input", () => {
    const sections = buildDiaryTimelineSections([]);
    expect(sections.map((s) => s.id)).toEqual([
      ...DIARY_TIMELINE_SECTION_ORDER,
    ]);
    for (const s of sections) expect(s.count).toBe(0);
  });

  it("places every input entry into exactly one section", () => {
    const items = [
      { id: "1", eventType: "watering" },
      { id: "2", eventType: "feeding" },
      { id: "3", eventType: "training" },
      { id: "4", eventType: "photo" },
      { id: "5", eventType: "symptoms" },
      { id: "6", eventType: "harvest" },
      { id: "7", eventType: "note" },
      { id: "8", eventType: "measurement" },
    ];
    const sections = buildDiaryTimelineSections(items);
    const total = sections.reduce((acc, s) => acc + s.count, 0);
    expect(total).toBe(items.length);
    expect(sections.find((s) => s.id === "watering")!.count).toBe(1);
    expect(sections.find((s) => s.id === "feeding")!.count).toBe(1);
    expect(sections.find((s) => s.id === "training")!.count).toBe(1);
    expect(sections.find((s) => s.id === "photos")!.count).toBe(1);
    expect(sections.find((s) => s.id === "diagnoses")!.count).toBe(1);
    expect(sections.find((s) => s.id === "harvest")!.count).toBe(1);
    // note + measurement both land in "other"
    expect(sections.find((s) => s.id === "other")!.count).toBe(2);
  });

  it("preserves input order within each section (chronological from caller)", () => {
    const items = [
      { id: "w1", eventType: "watering" },
      { id: "w2", eventType: "watering" },
      { id: "w3", eventType: "watering" },
    ];
    const watering = buildDiaryTimelineSections(items).find(
      (s) => s.id === "watering",
    )!;
    expect(watering.items.map((i) => i.id)).toEqual(["w1", "w2", "w3"]);
  });

  it("null / undefined input is treated as empty", () => {
    expect(buildDiaryTimelineSections(null).every((s) => s.count === 0)).toBe(
      true,
    );
    expect(
      buildDiaryTimelineSections(undefined).every((s) => s.count === 0),
    ).toBe(true);
  });

  it("attaches the exact required empty copy on every section", () => {
    const sections = buildDiaryTimelineSections([]);
    for (const s of sections) {
      expect(s.emptyCopy).toBe(DIARY_TIMELINE_SECTION_EMPTY_COPY[s.id]);
      expect(s.label).toBe(DIARY_TIMELINE_SECTION_LABELS[s.id]);
    }
  });
});

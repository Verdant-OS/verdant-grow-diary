import { describe, it, expect } from "vitest";
import {
  buildDefaultDiaryTimelineSectionState,
  buildDiaryTimelineSectionSummary,
  mergeSavedDiaryTimelineSectionState,
  parseDiaryTimelineSectionState,
  serializeDiaryTimelineSectionState,
  PLANT_RELATIVE_TIMELINE_SECTION_STATE_STORAGE_KEY,
} from "@/lib/diaryTimelineSectionStateRules";
import {
  buildDiaryTimelineSections,
  DIARY_TIMELINE_SECTION_ORDER,
} from "@/lib/diaryTimelineSectionRules";

function makeSections(input: { id: string; eventType: string }[]) {
  return buildDiaryTimelineSections(input);
}

describe("buildDefaultDiaryTimelineSectionState", () => {
  it("expands sections with entries, collapses empty sections", () => {
    const sections = makeSections([
      { id: "w1", eventType: "watering" },
      { id: "p1", eventType: "photo" },
    ]);
    const state = buildDefaultDiaryTimelineSectionState(sections);
    expect(state.watering).toBe(true);
    expect(state.photos).toBe(true);
    expect(state.feeding).toBe(false);
    expect(state.training).toBe(false);
    expect(state.diagnoses).toBe(false);
    expect(state.harvest).toBe(false);
    expect(state.other).toBe(false);
  });
  it("returns all known section ids even on null input", () => {
    const state = buildDefaultDiaryTimelineSectionState(null);
    for (const id of DIARY_TIMELINE_SECTION_ORDER) {
      expect(state[id]).toBe(false);
    }
  });
});

describe("mergeSavedDiaryTimelineSectionState", () => {
  const sections = makeSections([{ id: "w1", eventType: "watering" }]);

  it("overrides known section ids with saved booleans", () => {
    const merged = mergeSavedDiaryTimelineSectionState(sections, {
      watering: false,
      photos: true,
    });
    expect(merged.watering).toBe(false);
    expect(merged.photos).toBe(true);
  });
  it("ignores unknown saved keys", () => {
    const merged = mergeSavedDiaryTimelineSectionState(sections, {
      bogus: true,
      "../etc/passwd": true,
    });
    // defaults preserved (watering true because entry present)
    expect(merged.watering).toBe(true);
    expect((merged as Record<string, unknown>).bogus).toBeUndefined();
  });
  it("ignores non-boolean values", () => {
    const merged = mergeSavedDiaryTimelineSectionState(sections, {
      watering: "yes",
      photos: 1,
    });
    expect(merged.watering).toBe(true); // default kept
    expect(merged.photos).toBe(false);
  });
  it("null / undefined / array saved value returns defaults", () => {
    const a = mergeSavedDiaryTimelineSectionState(sections, null);
    const b = mergeSavedDiaryTimelineSectionState(sections, undefined);
    const c = mergeSavedDiaryTimelineSectionState(sections, []);
    for (const m of [a, b, c]) expect(m.watering).toBe(true);
  });
});

describe("parseDiaryTimelineSectionState", () => {
  it("parses valid JSON with known keys", () => {
    const out = parseDiaryTimelineSectionState(
      JSON.stringify({ watering: true, feeding: false }),
    );
    expect(out).toEqual({ watering: true, feeding: false });
  });
  it("malformed JSON returns null", () => {
    expect(parseDiaryTimelineSectionState("{not json")).toBeNull();
  });
  it("empty / nullish returns null", () => {
    expect(parseDiaryTimelineSectionState(null)).toBeNull();
    expect(parseDiaryTimelineSectionState(undefined)).toBeNull();
    expect(parseDiaryTimelineSectionState("")).toBeNull();
  });
  it("array / primitive JSON returns null", () => {
    expect(parseDiaryTimelineSectionState("[true,false]")).toBeNull();
    expect(parseDiaryTimelineSectionState("42")).toBeNull();
    expect(parseDiaryTimelineSectionState('"yes"')).toBeNull();
  });
  it("strips unknown keys + non-boolean values", () => {
    const out = parseDiaryTimelineSectionState(
      JSON.stringify({
        watering: true,
        bogus: true,
        photos: "yes",
        plantId: "plant-123",
      }),
    );
    expect(out).toEqual({ watering: true });
  });
});

describe("serializeDiaryTimelineSectionState", () => {
  it("only includes known section ids + booleans", () => {
    const raw = serializeDiaryTimelineSectionState({
      watering: true,
      feeding: false,
      training: true,
      photos: true,
      diagnoses: false,
      harvest: false,
      other: true,
      // forced extras get stripped because they are not in the section enum
      plantId: "plant-abc",
      noteText: "secret",
    } as unknown as never);
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed).sort()).toEqual([
      "diagnoses",
      "feeding",
      "harvest",
      "other",
      "photos",
      "training",
      "watering",
    ]);
    expect(parsed).not.toHaveProperty("plantId");
    expect(parsed).not.toHaveProperty("noteText");
  });
  it("never contains entry IDs, raw text, or sensor values", () => {
    const raw = serializeDiaryTimelineSectionState({
      watering: true,
    } as never);
    expect(raw).not.toMatch(/plant|tent|user|note|ppfd|raw_payload/i);
  });
  it("null state serializes to '{}'", () => {
    expect(serializeDiaryTimelineSectionState(null)).toBe("{}");
    expect(serializeDiaryTimelineSectionState(undefined)).toBe("{}");
  });
});

describe("buildDiaryTimelineSectionSummary", () => {
  it("counts total entries and non-empty sections", () => {
    const sections = makeSections([
      { id: "w1", eventType: "watering" },
      { id: "w2", eventType: "watering" },
      { id: "p1", eventType: "photo" },
    ]);
    const s = buildDiaryTimelineSectionSummary(sections);
    expect(s.totalEntries).toBe(3);
    expect(s.nonEmptySections).toBe(2);
    expect(s.otherCount).toBe(0);
    // Only includes the "Other" line when non-zero
    expect(s.parts.some((p) => /Other diary entries/.test(p))).toBe(false);
  });
  it("includes Other count only when non-zero", () => {
    const sections = makeSections([{ id: "n1", eventType: "note" }]);
    const s = buildDiaryTimelineSectionSummary(sections);
    expect(s.otherCount).toBe(1);
    expect(s.parts.some((p) => /Other diary entries/.test(p))).toBe(true);
  });
  it("handles empty / null safely", () => {
    expect(buildDiaryTimelineSectionSummary(null).totalEntries).toBe(0);
    expect(buildDiaryTimelineSectionSummary([]).nonEmptySections).toBe(0);
  });
  it("uses singular vs plural correctly", () => {
    const sections = makeSections([{ id: "w1", eventType: "watering" }]);
    const s = buildDiaryTimelineSectionSummary(sections);
    expect(s.parts[0]).toBe("1 entry");
    expect(s.parts[1]).toBe("1 section with entries");
  });
});

describe("storage key", () => {
  it("is namespaced and versioned per spec", () => {
    expect(PLANT_RELATIVE_TIMELINE_SECTION_STATE_STORAGE_KEY).toBe(
      "verdant:plant-relative-timeline:category-sections:v1",
    );
  });
});

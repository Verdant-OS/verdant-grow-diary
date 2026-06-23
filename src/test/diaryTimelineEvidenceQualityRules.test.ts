import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDiaryTimelineEvidenceQualityForSection,
  buildDiaryTimelineEvidenceQualitySummary,
  type DiaryTimelineEvidenceQualityStatus,
} from "@/lib/diaryTimelineEvidenceQualityRules";
import {
  buildDiaryTimelineSections,
  DIARY_TIMELINE_SECTION_ORDER,
} from "@/lib/diaryTimelineSectionRules";

type Item = { id: string; eventType?: string | null; source?: "note" | "photo" | "sensor" | null };

const SAMPLE_ITEMS: Item[] = [
  { id: "w1", eventType: "watering" },
  { id: "p1", eventType: "photo", source: "photo" },
  { id: "p2", eventType: "photo", source: "photo" },
];

describe("buildDiaryTimelineEvidenceQualityForSection", () => {
  it("returns 'present' for a non-empty section with the section-specific copy", () => {
    const sections = buildDiaryTimelineSections(SAMPLE_ITEMS);
    const watering = sections.find((s) => s.id === "watering")!;
    const q = buildDiaryTimelineEvidenceQualityForSection(watering);
    expect(q.status).toBe<DiaryTimelineEvidenceQualityStatus>("present");
    expect(q.sectionId).toBe("watering");
    expect(q.copy).toBe("Watering evidence present in this view.");
  });

  it("returns 'missing' for an empty section with section-specific copy using 'in this view'", () => {
    const sections = buildDiaryTimelineSections([]);
    for (const section of sections) {
      const q = buildDiaryTimelineEvidenceQualityForSection(section);
      expect(q.status).toBe("missing");
      expect(q.copy).toMatch(/in this view\.$/);
    }
  });

  it("is null-safe: null or malformed input collapses to a safe 'missing' fallback", () => {
    const a = buildDiaryTimelineEvidenceQualityForSection(null);
    expect(a.status).toBe("missing");
    expect(a.sectionId).toBe("other");
    const b = buildDiaryTimelineEvidenceQualityForSection(undefined);
    expect(b.status).toBe("missing");
    const c = buildDiaryTimelineEvidenceQualityForSection({
      // Unknown id collapses to "other"
      id: "bogus-id" as never,
      label: "Bogus",
      emptyCopy: "",
      count: 0,
      items: [],
    });
    expect(c.sectionId).toBe("other");
    expect(c.status).toBe("missing");
  });

  it("falls back to items.length when count is non-finite", () => {
    const q = buildDiaryTimelineEvidenceQualityForSection({
      id: "watering",
      label: "Watering",
      emptyCopy: "",
      count: Number.NaN as unknown as number,
      items: [{ id: "x" } as Item],
    });
    expect(q.status).toBe("present");
  });

  it("never emits diagnostic/aggressive/actionable wording in copy", () => {
    const sections = buildDiaryTimelineSections(SAMPLE_ITEMS);
    const banned = /\b(healthy|ideal|fix|urgent|auto|execute|control|actuate|relay|emergency|critical)\b/i;
    for (const section of sections) {
      const q = buildDiaryTimelineEvidenceQualityForSection(section);
      expect(q.copy).not.toMatch(banned);
    }
  });
});

describe("buildDiaryTimelineEvidenceQualitySummary", () => {
  it("counts present and missing sections from a built section list", () => {
    const sections = buildDiaryTimelineSections(SAMPLE_ITEMS);
    const s = buildDiaryTimelineEvidenceQualitySummary(sections);
    expect(s.totalSections).toBe(DIARY_TIMELINE_SECTION_ORDER.length);
    expect(s.presentCount).toBe(2); // watering + photos
    expect(s.missingCount).toBe(DIARY_TIMELINE_SECTION_ORDER.length - 2);
    expect(s.copy).toBe("2 of 7 sections have evidence in this view.");
  });

  it("is null-safe: null/undefined returns a zeroed summary with safe copy", () => {
    const a = buildDiaryTimelineEvidenceQualitySummary(null);
    expect(a).toEqual({
      totalSections: 0,
      presentCount: 0,
      missingCount: 0,
      copy: "No timeline sections to summarize in this view.",
    });
    const b = buildDiaryTimelineEvidenceQualitySummary(undefined);
    expect(b.totalSections).toBe(0);
  });

  it("summary copy always says 'in this view' rather than 'ever'", () => {
    const sections = buildDiaryTimelineSections([]);
    const s = buildDiaryTimelineEvidenceQualitySummary(sections);
    expect(s.copy).toMatch(/in this view/);
    expect(s.copy).not.toMatch(/\bever\b/i);
  });
});

describe("static safety — diaryTimelineEvidenceQualityRules.ts", () => {
  const source = readFileSync("src/lib/diaryTimelineEvidenceQualityRules.ts", "utf8");

  it("contains no Supabase, AI, fetch, automation, or write tokens", () => {
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/openai|anthropic|lovable-ai|gemini|model\s*:/i);
    expect(source).not.toMatch(/action_queue|alerts|service_role|bridge_token/i);
    expect(source).not.toMatch(/actuator|autopilot|device_command|mqtt|relay/i);
    expect(source).not.toMatch(/localStorage|window\./);
    expect(source).not.toMatch(/raw_payload/i);
  });

  it("never imports React or any UI surface", () => {
    expect(source).not.toMatch(/from\s+["']react["']/);
    expect(source).not.toMatch(/from\s+["']@\/components/);
    expect(source).not.toMatch(/from\s+["']@\/hooks/);
  });
});

/**
 * Tests for growDiaryTimelineRules — pure timeline view-model builder.
 */
import { describe, it, expect } from "vitest";
import {
  buildGrowDiaryTimeline,
  toTimelineItem,
} from "@/lib/growDiaryTimelineRules";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";

const NOW = 1_700_000_000_000;
const day = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const raw = {
  watering: {
    id: "e-water",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-1 * day),
    entry_type: "watering",
    note: "Watered plants with pH-balanced water.",
    details: { ph: 6.2, ec: 1.4, watering_amount_ml: 500 },
  },
  feeding: {
    id: "e-feed",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "flower",
    entry_at: iso(-2 * day),
    entry_type: "feeding",
    note: "Full nutrient mix.",
    details: {
      ph: 6.0,
      ec: 1.8,
      nutrients: [{ name: "CalMag", amount: 2, unit: "ml/L" }],
    },
  },
  training: {
    id: "e-train",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-3 * day),
    entry_type: "training",
    note: "Topped main stem.",
    details: { training_actions: ["topping"] },
  },
  photo: {
    id: "e-photo",
    grow_id: "g1",
    plant_id: "p2",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-4 * day),
    entry_type: "photo",
    note: "Looking healthy",
    photo_url: "https://example.com/p.jpg",
    details: {
      sensor_snapshot: { at: iso(-4 * day), temp: 24, rh: 55, vpd: 1.0 },
    },
  },
  observation: {
    id: "e-obs",
    grow_id: "g2",
    plant_id: "p9",
    tent_id: "t2",
    stage: "seedling",
    entry_at: iso(-5 * day),
    entry_type: "observation",
    note: "x".repeat(500),
    details: { symptoms: ["yellowing"] },
  },
  unknownType: {
    id: "e-unknown",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-6 * day),
    entry_type: "weird-event!!<script>",
    note: "n",
    details: {},
  },
  malformedDetails: {
    id: "e-bad",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-7 * day),
    entry_type: "watering",
    note: "broken",
    details: "{not-json",
  },
  invalidPh: {
    id: "e-badph",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: iso(-8 * day),
    entry_type: "feeding",
    note: "bad ph",
    details: { ph: "not-a-number" },
  },
};

const allRaw = Object.values(raw);

describe("buildGrowDiaryTimeline", () => {
  it("returns empty timeline for empty/missing input", () => {
    expect(buildGrowDiaryTimeline(null)).toEqual([]);
    expect(buildGrowDiaryTimeline(undefined)).toEqual([]);
    expect(buildGrowDiaryTimeline({ rawEntries: [] })).toEqual([]);
    expect(buildGrowDiaryTimeline({ entries: [] })).toEqual([]);
  });

  it("builds a complete mixed timeline newest-first", () => {
    const out = buildGrowDiaryTimeline({ rawEntries: allRaw, now: NOW });
    // Only valid entries by default (no includeInvalid).
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i < out.length; i += 1) {
      expect((out[i - 1].timestamp ?? -Infinity) >=
        (out[i].timestamp ?? -Infinity)).toBe(true);
    }
    // Newest entry should be the watering (-1 day).
    expect(out[0].id).toBe("e-water");
  });

  it("ordering is deterministic with id lexical tie-breaker", () => {
    const sameTimeRaw = [
      { id: "z", entry_at: iso(0), entry_type: "note", details: {} },
      { id: "a", entry_at: iso(0), entry_type: "note", details: {} },
      { id: "m", entry_at: iso(0), entry_type: "note", details: {} },
    ];
    const out = buildGrowDiaryTimeline({ rawEntries: sameTimeRaw, now: NOW });
    expect(out.map((x) => x.id)).toEqual(["a", "m", "z"]);
  });

  it("filters by growId/plantId/tentId", () => {
    const byGrow = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { growId: "g2" },
      now: NOW,
    });
    expect(byGrow.every((i) => i.growId === "g2")).toBe(true);
    expect(byGrow.map((i) => i.id)).toContain("e-obs");

    const byPlant = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { plantId: "p2" },
      now: NOW,
    });
    expect(byPlant.every((i) => i.plantId === "p2")).toBe(true);
    expect(byPlant.map((i) => i.id)).toEqual(["e-photo"]);

    const byTent = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { tentId: "t2" },
      now: NOW,
    });
    expect(byTent.every((i) => i.tentId === "t2")).toBe(true);
  });

  it("filters by event type, stage, and date range", () => {
    const byType = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { eventType: ["watering", "feeding"] },
      now: NOW,
    });
    expect(byType.map((i) => i.eventType).sort()).toEqual(["feeding", "watering"]);

    const byStage = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { stage: "seedling" },
      now: NOW,
    });
    expect(byStage.map((i) => i.id)).toEqual(["e-obs"]);

    const byDate = buildGrowDiaryTimeline({
      rawEntries: allRaw,
      filter: { startAt: iso(-3 * day - 1), endAt: iso(-1 * day + 1) },
      now: NOW,
    });
    const ids = byDate.map((i) => i.id);
    expect(ids).toContain("e-water");
    expect(ids).toContain("e-feed");
    expect(ids).toContain("e-train");
    expect(ids).not.toContain("e-photo");
  });

  it("hides invalid entries by default", () => {
    const out = buildGrowDiaryTimeline({ rawEntries: allRaw, now: NOW });
    const ids = out.map((i) => i.id);
    expect(ids).not.toContain("e-bad");
    expect(ids).not.toContain("e-badph");
  });

  it("includeInvalid=true shows invalid entries with warnings", () => {
    const out = buildGrowDiaryTimeline({
      rawEntries: [raw.malformedDetails, raw.invalidPh],
      filter: { includeInvalid: true },
      now: NOW,
    });
    expect(out.length).toBe(2);
    for (const item of out) {
      expect(item.warnings.length).toBeGreaterThan(0);
      expect(item.isUsefulForAiContext).toBe(false);
    }
  });

  it("clips note preview length and does not leak large raw payloads", () => {
    const out = buildGrowDiaryTimeline({
      rawEntries: [raw.observation],
      now: NOW,
      notePreviewMaxLength: 80,
    });
    expect(out.length).toBe(1);
    expect(out[0].notePreview.length).toBeLessThanOrEqual(80);
    expect(out[0].notePreview.endsWith("…")).toBe(true);
  });

  it("marks photo and sensor-snapshot tags", () => {
    const out = buildGrowDiaryTimeline({ rawEntries: [raw.photo], now: NOW });
    expect(out[0].hasPhoto).toBe(true);
    expect(out[0].hasSensorSnapshot).toBe(true);
    expect(out[0].tags).toContain("photo");
    expect(out[0].tags).toContain("sensor-snapshot");
  });

  it("watering/feeding/training entries get useful titles and tags", () => {
    const out = buildGrowDiaryTimeline({
      rawEntries: [raw.watering, raw.feeding, raw.training],
      now: NOW,
    });
    const byId = Object.fromEntries(out.map((i) => [i.id, i]));
    expect(byId["e-water"].title).toBe("Watering");
    expect(byId["e-water"].tags).toContain("watering");
    expect(byId["e-feed"].title).toBe("Feeding");
    expect(byId["e-feed"].tags).toContain("feeding");
    expect(byId["e-train"].title).toBe("Training");
    expect(byId["e-train"].tags).toContain("training");
  });

  it("falls back to a safe label for unknown event types", () => {
    const out = buildGrowDiaryTimeline({
      rawEntries: [raw.unknownType],
      now: NOW,
    });
    expect(out.length).toBe(1);
    const t = out[0].title;
    expect(t).not.toContain("<");
    expect(t).not.toContain("!");
    // Sanitized label starts with capital letter.
    expect(/^[A-Z]/.test(t)).toBe(true);
  });

  it("isUsefulForAiContext mirrors normalization validity", () => {
    const out = buildGrowDiaryTimeline({
      rawEntries: [raw.watering, raw.malformedDetails],
      filter: { includeInvalid: true },
      now: NOW,
    });
    const valid = out.find((i) => i.id === "e-water");
    const invalid = out.find((i) => i.id === "e-bad");
    expect(valid?.isUsefulForAiContext).toBe(true);
    expect(invalid?.isUsefulForAiContext).toBe(false);
  });

  it("no raw payload leakage into preview or title (large/odd strings)", () => {
    const giantNote = "secret:" + "X".repeat(10_000);
    const out = buildGrowDiaryTimeline({
      rawEntries: [
        {
          id: "leak",
          entry_at: iso(0),
          entry_type: "<script>alert(1)</script>",
          note: giantNote,
          details: {},
        },
      ],
      now: NOW,
    });
    const item = out[0];
    expect(item.notePreview.length).toBeLessThanOrEqual(160);
    expect(item.title).not.toContain("<");
    expect(item.title).not.toContain(">");
    // Warnings must not echo raw note/details.
    for (const w of item.warnings) {
      expect(w).not.toContain(giantNote);
      expect(w.length).toBeLessThan(80);
    }
  });

  it("accepts pre-normalized entries directly", () => {
    const normalized = normalizeDiaryEntry(raw.watering, {});
    const out = buildGrowDiaryTimeline({
      entries: normalized ? [normalized] : [],
      now: NOW,
    });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("e-water");
  });
});

describe("toTimelineItem", () => {
  it("produces a stable shape from a normalized entry", () => {
    const n = normalizeDiaryEntry(raw.watering, {})!;
    const item = toTimelineItem(n);
    expect(item.id).toBe("e-water");
    expect(item.hasPhoto).toBe(false);
    expect(item.tags).toContain("watering");
    expect(item.subtitle).toContain("pH 6.2");
  });
});

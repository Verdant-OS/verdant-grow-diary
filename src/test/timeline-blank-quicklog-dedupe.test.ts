import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dropBlankQuickLogPlaceholderRows } from "@/lib/timelineQuickLogPlaceholderDedupeRules";

const photo = {
  id: "photo-1",
  note: "Photo attached from Quick Log.",
  photo_url: "https://example.test/leaf.jpg",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-10-14T14:47:00.000Z",
};

const blank = {
  id: "blank-1",
  note: "(quick log)",
  photo_url: null,
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-10-14T14:47:05.000Z",
};

describe("dropBlankQuickLogPlaceholderRows", () => {
  it("drops the blank quick-log mirror that arrives with a photo row", () => {
    const kept = dropBlankQuickLogPlaceholderRows([photo, blank]);
    expect(kept.map((row) => row.id)).toEqual(["photo-1"]);
  });

  it("keeps a lone placeholder when no photo companion exists", () => {
    const kept = dropBlankQuickLogPlaceholderRows([blank]);
    expect(kept.map((row) => row.id)).toEqual(["blank-1"]);
  });

  it("keeps a placeholder written for a different tent", () => {
    const otherTent = { ...blank, id: "blank-other", tent_id: "tent-9", plant_id: "plant-9" };
    const kept = dropBlankQuickLogPlaceholderRows([photo, otherTent]);
    expect(kept.map((row) => row.id).sort()).toEqual(["blank-other", "photo-1"]);
  });
});

describe("Timeline display wiring", () => {
  it("filters display rows through the placeholder drop", () => {
    const source = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");
    expect(source).toContain("dropBlankQuickLogPlaceholderRows");
  });
});

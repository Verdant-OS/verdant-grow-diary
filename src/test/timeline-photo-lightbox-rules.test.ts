/**
 * timelinePhotoLightboxRules — pure helper tests. Read-only, deterministic.
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelinePhotoAltText,
  buildTimelinePhotoLightboxList,
  findTimelinePhotoIndexById,
  resolveTimelinePhotoNavigation,
} from "@/lib/timelinePhotoLightboxRules";

const ROWS = [
  { id: "a", photo_url: "https://x/a.jpg", entry_at: "2025-01-01T00:00:00Z", note: "n1", stage: "veg", details: { plant_name: "Blue Dream" } },
  { id: "b", photo_url: null, entry_at: "2025-01-02T00:00:00Z", note: "no photo", stage: "veg", details: {} },
  { id: "c", photo_url: "  ", entry_at: null, note: "blank", stage: null, details: {} },
  { id: "d", photo_url: "https://x/d.jpg", entry_at: "2025-01-03T00:00:00Z", note: "n2", stage: "flower", details: {} },
];

describe("buildTimelinePhotoLightboxList", () => {
  it("only includes rows with safe non-empty photo_url and preserves order", () => {
    const list = buildTimelinePhotoLightboxList(ROWS);
    expect(list.map((p) => p.id)).toEqual(["a", "d"]);
  });

  it("returns [] for null/undefined/non-array", () => {
    expect(buildTimelinePhotoLightboxList(null)).toEqual([]);
    expect(buildTimelinePhotoLightboxList(undefined)).toEqual([]);
    // @ts-expect-error invalid input guard
    expect(buildTimelinePhotoLightboxList({})).toEqual([]);
  });

  it("rejects urls containing token/secret fragments", () => {
    const bad = [
      { id: "x", photo_url: "https://x/?PASSKEY=1" },
      { id: "y", photo_url: "https://x/?Authorization=Bearer xyz" },
      { id: "z", photo_url: "https://x/?service_role=abc" },
      { id: "w", photo_url: "https://x/?token=vbt_abc" },
      { id: "ok", photo_url: "https://x/ok.jpg" },
    ];
    expect(buildTimelinePhotoLightboxList(bad).map((i) => i.id)).toEqual(["ok"]);
  });

  it("captures plantName, stage, entryAt from safe fields only", () => {
    const [first] = buildTimelinePhotoLightboxList(ROWS);
    expect(first.plantName).toBe("Blue Dream");
    expect(first.stage).toBe("veg");
    expect(first.entryAt).toBe("2025-01-01T00:00:00Z");
  });
});

describe("resolveTimelinePhotoNavigation", () => {
  const list = buildTimelinePhotoLightboxList(ROWS);

  it("disables both edges in a single-photo list", () => {
    const nav = resolveTimelinePhotoNavigation([list[0]], 0);
    expect(nav.hasPrevious).toBe(false);
    expect(nav.hasNext).toBe(false);
    expect(nav.total).toBe(1);
  });

  it("returns previous/next around middle", () => {
    const three = [list[0], list[1], list[0]];
    const nav = resolveTimelinePhotoNavigation(three, 1);
    expect(nav.previousIndex).toBe(0);
    expect(nav.nextIndex).toBe(2);
    expect(nav.hasPrevious).toBe(true);
    expect(nav.hasNext).toBe(true);
  });

  it("disables previous at start and next at end", () => {
    const start = resolveTimelinePhotoNavigation(list, 0);
    expect(start.hasPrevious).toBe(false);
    expect(start.hasNext).toBe(true);
    const end = resolveTimelinePhotoNavigation(list, list.length - 1);
    expect(end.hasPrevious).toBe(true);
    expect(end.hasNext).toBe(false);
  });

  it("returns disabled state for out-of-range/empty inputs", () => {
    expect(resolveTimelinePhotoNavigation([], 0).currentIndex).toBe(-1);
    expect(resolveTimelinePhotoNavigation(list, -1).currentIndex).toBe(-1);
    expect(resolveTimelinePhotoNavigation(list, 99).currentIndex).toBe(-1);
  });
});

describe("findTimelinePhotoIndexById", () => {
  it("returns the matching index or -1", () => {
    const list = buildTimelinePhotoLightboxList(ROWS);
    expect(findTimelinePhotoIndexById(list, "d")).toBe(1);
    expect(findTimelinePhotoIndexById(list, "missing")).toBe(-1);
    expect(findTimelinePhotoIndexById(list, null)).toBe(-1);
  });
});

describe("buildTimelinePhotoAltText", () => {
  it("includes plant name and entry timestamp", () => {
    const list = buildTimelinePhotoLightboxList(ROWS);
    const alt = buildTimelinePhotoAltText(list[0]);
    expect(alt).toContain("Timeline photo");
    expect(alt).toContain("Blue Dream");
    expect(alt).toContain("2025-01-01T00:00:00Z");
  });

  it("falls back safely when item is null", () => {
    expect(buildTimelinePhotoAltText(null)).toBe("Timeline photo");
  });
});

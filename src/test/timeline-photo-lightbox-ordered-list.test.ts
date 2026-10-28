import { describe, expect, it } from "vitest";
import { buildOrderedTimelinePhotoLightboxList } from "@/lib/timelinePhotoLightboxRules";

const row = (id: string, photo_url: string | null, note = "") => ({ id, photo_url, note });

describe("buildOrderedTimelinePhotoLightboxList", () => {
  it("follows the caller's id order, not the row order", () => {
    const rows = [
      row("c", "https://x/c.jpg"),
      row("a", "https://x/a.jpg"),
      row("b", "https://x/b.jpg"),
    ];
    expect(buildOrderedTimelinePhotoLightboxList(rows, ["a", "b", "c"]).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("skips ids with no row and rows with no usable photo", () => {
    const rows = [row("a", "https://x/a.jpg"), row("b", null), row("c", "   ")];
    expect(
      buildOrderedTimelinePhotoLightboxList(rows, ["missing", "a", "b", "c"]).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("keeps the first row when an id repeats", () => {
    const rows = [row("a", "https://x/first.jpg"), row("a", "https://x/second.jpg")];
    expect(buildOrderedTimelinePhotoLightboxList(rows, ["a"])).toEqual([
      expect.objectContaining({ id: "a", photoUrl: "https://x/first.jpg" }),
    ]);
  });

  it("is null-safe", () => {
    expect(buildOrderedTimelinePhotoLightboxList(null, ["a"])).toEqual([]);
    expect(buildOrderedTimelinePhotoLightboxList([row("a", "https://x/a.jpg")], null)).toEqual([]);
  });
});

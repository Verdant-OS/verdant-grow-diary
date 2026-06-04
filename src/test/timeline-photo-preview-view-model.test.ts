import { describe, it, expect } from "vitest";
import { buildTimelinePhotoPreviewViewModel } from "@/lib/timelinePhotoPreviewViewModel";

describe("buildTimelinePhotoPreviewViewModel", () => {
  it("returns none for empty input", () => {
    expect(buildTimelinePhotoPreviewViewModel({}).kind).toBe("none");
    expect(
      buildTimelinePhotoPreviewViewModel({ photos: [], photoUrl: null }).kind,
    ).toBe("none");
  });

  it("renders up to 3 thumbnails from photos array", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photos: [
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
        "https://example.com/c.jpg",
      ],
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails).toHaveLength(3);
    expect(vm.moreCount).toBe(0);
    expect(vm.totalCount).toBe(3);
  });

  it("shows +N more when more than 3 photos exist", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photos: [
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
        "https://example.com/c.jpg",
        "https://example.com/d.jpg",
        "https://example.com/e.jpg",
      ],
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails).toHaveLength(3);
    expect(vm.moreCount).toBe(2);
    expect(vm.totalCount).toBe(5);
  });

  it("does not include invalid / empty URLs", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photos: ["", "  ", "not-a-url", { foo: "bar" }, "https://example.com/ok.jpg"],
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails).toHaveLength(1);
    expect(vm.thumbnails[0].url).toBe("https://example.com/ok.jpg");
  });

  it("returns none when only invalid URLs are supplied", () => {
    expect(
      buildTimelinePhotoPreviewViewModel({
        photos: ["not-a-url", { nope: true }],
        photoUrl: "also-invalid",
      }).kind,
    ).toBe("none");
  });

  it("accepts `{ url }` object entries", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photos: [{ url: "https://example.com/x.jpg" }, { src: "/y.jpg" }],
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails.map((t) => t.url)).toEqual([
      "https://example.com/x.jpg",
      "/y.jpg",
    ]);
  });

  it("falls back to single photoUrl when photos array is empty", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photoUrl: "https://example.com/solo.jpg",
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails).toHaveLength(1);
    expect(vm.totalCount).toBe(1);
  });

  it("composes accessible alt text with plant + event + date context", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      context: {
        plantName: "GG#4",
        occurredAt: "2026-06-04T12:00:00Z",
        eventType: "watering",
      },
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails[0].alt).toContain("GG#4");
    expect(vm.thumbnails[0].alt).toContain("watering");
    expect(vm.thumbnails[0].alt).toContain("2026-06-04T12:00:00Z");
    expect(vm.thumbnails[0].alt).toContain("1 of 2");
  });

  it("uses generic alt when no context is provided", () => {
    const vm = buildTimelinePhotoPreviewViewModel({
      photoUrl: "https://example.com/x.jpg",
    });
    expect(vm.kind).toBe("strip");
    if (vm.kind !== "strip") return;
    expect(vm.thumbnails[0].alt).toBe("Timeline photo");
  });
});

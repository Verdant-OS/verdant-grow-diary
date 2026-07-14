import { describe, it, expect } from "vitest";
import {
  extractTimelineVideoSlot,
  resolveTimelineVideoEntry,
} from "@/lib/timelineVideoEntryRules";

describe("timelineVideoEntryRules", () => {
  it("extracts video slot from valid details.video", () => {
    const slot = extractTimelineVideoSlot({
      video: {
        path: "u/g/1.mp4",
        mime: "video/mp4",
        size_bytes: 100,
        duration_s: 5,
        poster_path: null,
      },
    });
    expect(slot).toEqual({
      path: "u/g/1.mp4",
      mime: "video/mp4",
      sizeBytes: 100,
      durationS: 5,
      posterPath: null,
    });
  });

  it("returns null for missing / malformed video details", () => {
    expect(extractTimelineVideoSlot(null)).toBeNull();
    expect(extractTimelineVideoSlot({})).toBeNull();
    expect(extractTimelineVideoSlot({ video: {} })).toBeNull();
    expect(extractTimelineVideoSlot({ video: { path: "" } })).toBeNull();
  });

  it("renders video card when only details.video exists", () => {
    const r = resolveTimelineVideoEntry({
      details: { video: { path: "p.mp4" } },
    });
    expect(r.showVideo).toBe(true);
    expect(r.showPhoto).toBe(false);
    expect(r.video?.path).toBe("p.mp4");
    expect(r.warnings).toEqual([]);
  });

  it("prefers photo and warns when both photo_url and details.video exist", () => {
    const r = resolveTimelineVideoEntry({
      photoUrl: "photo.jpg",
      details: { video: { path: "p.mp4" } },
    });
    expect(r.showVideo).toBe(false);
    expect(r.showPhoto).toBe(true);
    expect(r.video).toBeNull();
    expect(r.warnings).toContain("photo_over_video_conflict");
  });

  it("photo-only entries are unchanged", () => {
    const r = resolveTimelineVideoEntry({ photoUrl: "photo.jpg", details: {} });
    expect(r.showVideo).toBe(false);
    expect(r.showPhoto).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("does not treat a video entry as photo evidence", () => {
    const r = resolveTimelineVideoEntry({
      photoUrl: null,
      details: { video: { path: "p.mp4" } },
    });
    expect(r.showPhoto).toBe(false);
  });
});

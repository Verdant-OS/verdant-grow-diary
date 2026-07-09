import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE,
  buildQuickLogVideoDiaryEntryRow,
} from "@/lib/quickLogVideoDiaryEntry";

describe("quickLogVideoDiaryEntry builder", () => {
  const fixed = () => new Date("2026-07-07T12:00:00.000Z");
  const base = {
    growId: "g1",
    tentId: "t1",
    plantId: "p1",
    videoPath: "u/g1/1.mp4",
    mime: "video/mp4",
    sizeBytes: 4096,
    durationS: 12,
    action: "note",
    now: fixed,
  };

  it("sets photo_url to null and writes canonical details.video", () => {
    const row = buildQuickLogVideoDiaryEntryRow({ ...base, noteRaw: "  Looking healthy  " });
    expect(row.photo_url).toBeNull();
    expect(row.note).toBe("Looking healthy");
    expect(row.entry_at).toBe("2026-07-07T12:00:00.000Z");
    expect(row.details.event_type).toBe("quicklog_video_attachment");
    expect(row.details.source).toBe("manual");
    expect(row.details.attached_to_action).toBe("note");
    expect(row.details.video).toEqual({
      path: "u/g1/1.mp4",
      mime: "video/mp4",
      size_bytes: 4096,
      duration_s: 12,
      poster_path: null,
    });
  });

  it("falls back to the default note when blank", () => {
    const row = buildQuickLogVideoDiaryEntryRow({ ...base, noteRaw: "   " });
    expect(row.note).toBe(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE);
  });

  it("never puts the video path into photo_url", () => {
    const row = buildQuickLogVideoDiaryEntryRow({ ...base, noteRaw: "x" });
    // Static invariant: JSON payload must not contain the video path as photo_url.
    const serialized = JSON.stringify(row);
    expect(row.photo_url).toBeNull();
    expect(serialized).toContain('"photo_url":null');
  });
});

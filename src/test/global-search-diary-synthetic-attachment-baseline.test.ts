/**
 * Global search diary spec — synthetic Quick Log attachment notes (requirement 1).
 *
 * Default photo/video diary notes are machine-authored and must not match grower
 * substring search. Grower captions on the same attachment types still match.
 * Spec: docs/specs/global-search-diary-entries.md (exclusion under requirement 1).
 */
import { describe, expect, it } from "vitest";

import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";

/** Mirrors the spec exclusion until `globalSearchDiaryRules` ships. */
function isDiarySearchSyntheticAttachmentNote(
  details: Record<string, unknown> | null | undefined,
  note: string,
): boolean {
  const eventType = details?.event_type;
  if (
    (eventType === "quicklog_photo_attachment" || eventType === "photo") &&
    note === QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE
  ) {
    return true;
  }
  if (eventType === "quicklog_video_attachment" && note === QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE) {
    return true;
  }
  return false;
}

describe("global search diary synthetic attachment baseline", () => {
  it("treats default photo and video attachment notes as non-authored", () => {
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "quicklog_photo_attachment" },
        QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE,
      ),
    ).toBe(true);
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "photo" },
        QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE,
      ),
    ).toBe(true);
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "quicklog_video_attachment" },
        QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE,
      ),
    ).toBe(true);
  });

  it("still allows grower captions on photo and video attachment rows", () => {
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "quicklog_photo_attachment" },
        "Yellow leaves on lower fan",
      ),
    ).toBe(false);
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "quicklog_video_attachment" },
        "Canopy sway after defoliation",
      ),
    ).toBe(false);
  });

  it("does not exclude substring matches on unrelated event types", () => {
    expect(
      isDiarySearchSyntheticAttachmentNote(
        { event_type: "water" },
        QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE,
      ),
    ).toBe(false);
  });
});

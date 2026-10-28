/**
 * Global search diary spec — synthetic attachment notes (docs/specs/global-search-diary-entries.md requirement 1).
 *
 * Photo/video Quick Log rows use fixed default notes when the grower leaves the
 * caption empty. They must not be searched as grower text; exclusion is separate
 * from `isQuickLogPlaceholderNote`, which only handles `(quick log)`. Both default
 * captions contain "photo" / "video", so a naive substring search for those words would
 * return them; the implementing slice must exclude them by exact note and event type.
 */
import { describe, expect, it } from "vitest";

import { isQuickLogPlaceholderNote } from "@/lib/plantFeedingDisplayRules";
import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";

describe("global search diary synthetic attachment note baseline", () => {
  it("does not treat photo or video default captions as Quick Log placeholders", () => {
    expect(isQuickLogPlaceholderNote(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE)).toBe(false);
    expect(isQuickLogPlaceholderNote(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE)).toBe(false);
    // The trap the header names: a naive substring search would return these.
    expect(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE).toMatch(/photo/i);
    expect(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE).toMatch(/video/i);
  });

  it("keeps grower-written captions distinct from the synthetic defaults", () => {
    expect(isQuickLogPlaceholderNote("Yellow leaves in the photo")).toBe(false);
    expect(isQuickLogPlaceholderNote("Training video notes")).toBe(false);
  });
});

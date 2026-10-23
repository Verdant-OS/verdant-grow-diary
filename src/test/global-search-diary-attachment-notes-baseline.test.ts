/**
 * Global search diary spec — synthetic attachment notes baseline (requirement 1).
 *
 * Photo/video attachment rows use fixed default notes when the grower leaves the
 * caption empty. Search must exclude those defaults but still match grower captions.
 */
import { describe, expect, it } from "vitest";

import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";

describe("global search diary attachment notes baseline", () => {
  it("pins the exact photo and video placeholder strings for exclusion rules", () => {
    expect(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE).toBe("Photo attached from Quick Log.");
    expect(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE).toBe("Video attached from Quick Log.");
  });

  it("treats substring photo/video in grower captions as distinct from placeholders", () => {
    expect("My photo of yellow leaves".includes("photo")).toBe(true);
    expect("My photo of yellow leaves").not.toBe(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE);
  });
});

/**
 * Global search diary spec — synthetic attachment notes (requirement 1).
 *
 * Default photo/video diary notes are not grower-authored. Naive substring
 * search for "photo" or "video" would match them unless the RPC excludes them.
 */
import { describe, expect, it } from "vitest";

import { QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogPhotoDiaryEntry";
import { QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE } from "@/lib/quickLogVideoDiaryEntry";

function naiveCaseInsensitiveIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

describe("global search diary attachment note baseline", () => {
  it("documents that default attachment notes match naive photo/video substring search", () => {
    expect(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE).toBe("Photo attached from Quick Log.");
    expect(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE).toBe("Video attached from Quick Log.");
    expect(naiveCaseInsensitiveIncludes(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE, "photo")).toBe(true);
    expect(naiveCaseInsensitiveIncludes(QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE, "video")).toBe(true);
  });
});

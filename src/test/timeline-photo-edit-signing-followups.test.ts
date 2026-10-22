/**
 * Timeline photo signing follow-ups on #2199 code (reported on #2267 at
 * 4dcba2be, Copilot):
 *   4. An unchanged storage path can still need signing. After an edit moved
 *      the photo, a second note-only save before the new path was signed
 *      cleared the pending signing and left the photo blank until reload.
 *   5. The diary read's initial signing did not check the row's current
 *      reference, so a late signed URL could overwrite an edited or removed
 *      photo and put a removed photo back in Photos.
 */
import { describe, expect, it } from "vitest";
import {
  applyTimelineDiaryPhotoEdit,
  timelineEntryCountsAsPhoto,
  timelineSignedPhotoPathStillCurrent,
} from "@/lib/timelineChipCountRules";

const VIEWER = "user-1";
const pathA = `${VIEWER}/grow-1/a.jpg`;
const pathB = `${VIEWER}/grow-1/b.jpg`;

describe("an unchanged storage path that is still unsigned is signed again (Copilot, item 4)", () => {
  it("asks to sign the same path on a second note-only save before the first signing landed", () => {
    // First save moved the photo to B; its signing is still in flight.
    const first = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      {
        id: "e1",
        photo_url: "https://signed.example/a",
        details: { photo_url: pathA },
        photoReferenceSource: "details",
      },
      { photo_url: pathB },
      VIEWER,
    );
    expect(first.signStoragePath).toBe(pathB);
    expect(first.photo_url).toBeNull();

    // Second save edits only the note; the path is still B and still unsigned.
    const second = applyTimelineDiaryPhotoEdit(
      first.photoIds,
      {
        id: "e1",
        photo_url: first.photo_url,
        details: { photo_url: pathB },
        photoReferenceSource: first.photoReferenceSource,
      },
      { photo_url: pathB, note: "edited note" },
      VIEWER,
    );
    expect(second.signStoragePath).toBe(pathB);
    expect(second.photo_url).toBeNull();
    expect(second.photoIds.has("e1")).toBe(true);
  });

  it("keeps an already-signed URL and asks for no signing when the path is unchanged", () => {
    const result = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      {
        id: "e1",
        photo_url: "https://signed.example/b",
        details: { photo_url: pathB },
        photoReferenceSource: "details",
      },
      { photo_url: pathB, note: "edited note" },
      VIEWER,
    );
    expect(result.photo_url).toBe("https://signed.example/b");
    expect(result.signStoragePath).toBeNull();
  });
});

describe("the read's initial signed URL applies only to a still-current reference (Copilot, item 5)", () => {
  it("applies to an unedited details photo and to a top-level photo", () => {
    expect(
      timelineSignedPhotoPathStillCurrent(
        { details: { photo_url: pathA }, photoReferenceSource: "details" },
        pathA,
        VIEWER,
      ),
    ).toBe(true);
    expect(
      timelineSignedPhotoPathStillCurrent(
        { details: {}, photoReferenceSource: "top" },
        pathA,
        VIEWER,
      ),
    ).toBe(true);
  });

  it("does not apply after an edit moved the photo to another path", () => {
    expect(
      timelineSignedPhotoPathStillCurrent(
        { details: { photo_url: pathB }, photoReferenceSource: "details" },
        pathA,
        VIEWER,
      ),
    ).toBe(false);
  });

  it("does not apply after an edit replaced the photo with an external URL", () => {
    expect(
      timelineSignedPhotoPathStillCurrent(
        { details: { photo_url: "https://cdn.example/x.jpg" }, photoReferenceSource: "details" },
        pathA,
        VIEWER,
      ),
    ).toBe(false);
  });

  it("does not put a removed photo back in Photos", () => {
    const removed = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      {
        id: "e1",
        photo_url: null,
        details: { photo_url: pathA },
        photoReferenceSource: "details",
      },
      { note: "photo removed" },
      VIEWER,
    );
    const row = {
      id: "e1",
      photo_url: removed.photo_url,
      details: { note: "photo removed" },
      photoReferenceSource: removed.photoReferenceSource,
    };
    expect(timelineSignedPhotoPathStillCurrent(row, pathA, VIEWER)).toBe(false);
    expect(timelineEntryCountsAsPhoto(row, removed.photoIds)).toBe(false);
  });

  it("is null-safe for rows without a known reference source", () => {
    expect(timelineSignedPhotoPathStillCurrent({ details: null }, pathA, VIEWER)).toBe(false);
    expect(
      timelineSignedPhotoPathStillCurrent(
        { details: { photo_url: pathA }, photoReferenceSource: null },
        pathA,
        VIEWER,
      ),
    ).toBe(false);
  });
});

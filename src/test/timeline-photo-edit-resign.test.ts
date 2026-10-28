/**
 * #2199 Codex P2 (PRRT_kwDOSc4h5c6uGCom): editing a details photo fallback
 * from one private storage path to another clears the old signed URL, so the
 * new path must be signed after the save. An unchanged or non-storage
 * reference needs no signing.
 */
import { describe, expect, it } from "vitest";
import { applyTimelineDiaryPhotoEdit } from "@/lib/timelineChipCountRules";

const VIEWER = "user-1";
const pathA = `${VIEWER}/grow-1/a.jpg`;
const pathB = `${VIEWER}/grow-1/b.jpg`;

function row(path: string) {
  return {
    id: "e1",
    photo_url: "https://signed.example/a",
    details: { photo_url: path },
    photoReferenceSource: "details" as const,
  };
}

describe("Timeline photo edit asks for the new storage path to be signed", () => {
  it("asks to sign the new path when the storage path changes", () => {
    const result = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      row(pathA),
      { photo_url: pathB },
      VIEWER,
    );
    expect(result.photo_url).toBeNull();
    expect(result.signStoragePath).toBe(pathB);
  });

  it("does not re-sign an unchanged storage path", () => {
    const result = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      row(pathA),
      { photo_url: pathA },
      VIEWER,
    );
    expect(result.photo_url).toBe("https://signed.example/a");
    expect(result.signStoragePath).toBeNull();
  });

  it("does not sign an external or removed reference", () => {
    const external = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      row(pathA),
      { photo_url: "https://cdn.example/x.jpg" },
      VIEWER,
    );
    expect(external.signStoragePath).toBeNull();
    const removed = applyTimelineDiaryPhotoEdit(new Set(["e1"]), row(pathA), {}, VIEWER);
    expect(removed.signStoragePath).toBeNull();
  });
});

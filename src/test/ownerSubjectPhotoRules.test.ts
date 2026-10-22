import { describe, expect, it } from "vitest";
import {
  buildOwnerSubjectPhotoObjectPath,
  formatOwnerSubjectPhotoReference,
} from "@/lib/ownerSubjectPhotoRules";
import { PLANT_PROFILE_PHOTO_BUCKET } from "@/lib/plantProfilePhotoStorageRules";

describe("buildOwnerSubjectPhotoObjectPath", () => {
  it("scopes tent photos under the owner id and tent subject id", () => {
    const path = buildOwnerSubjectPhotoObjectPath({
      userId: "user-1",
      kind: "tent",
      subjectId: "tent-9",
      extension: "jpeg",
      randomId: () => "fixed-id",
    });
    expect(path).toBe("user-1/tents/tent-9/fixed-id.jpeg");
  });

  it("scopes harvest photos under harvests folder", () => {
    const path = buildOwnerSubjectPhotoObjectPath({
      userId: "user-2",
      kind: "harvest",
      subjectId: "harvest-3",
      extension: ".PNG",
      randomId: () => "abc",
    });
    expect(path).toBe("user-2/harvests/harvest-3/abc.png");
  });
});

describe("formatOwnerSubjectPhotoReference", () => {
  it("returns a diary-photos storage reference, never a signed URL", () => {
    const path = "user-1/tents/tent-1/photo.webp";
    const reference = formatOwnerSubjectPhotoReference(path);
    expect(reference).toBe(`storage://${PLANT_PROFILE_PHOTO_BUCKET}/${path}`);
    expect(reference.startsWith("storage://")).toBe(true);
    expect(reference).not.toMatch(/https?:/);
    expect(reference).not.toMatch(/token/);
  });
});

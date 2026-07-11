import { describe, it, expect } from "vitest";
import {
  validatePlantProfilePhotoFile,
  PLANT_PROFILE_PHOTO_MAX_BYTES,
  plantProfilePhotoExtensionForMime,
} from "@/lib/plantProfilePhotoFileRules";

const f = (type: string, size: number) => ({ type, size });

describe("validatePlantProfilePhotoFile", () => {
  it("accepts the allowed image types", () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]) {
      const r = validatePlantProfilePhotoFile(f(type, 1024));
      expect(r.ok).toBe(true);
    }
  });

  it("derives extension from the validated MIME, not the filename", () => {
    const r = validatePlantProfilePhotoFile(f("image/jpeg", 2048));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extension).toBe("jpg");
    expect(plantProfilePhotoExtensionForMime("image/webp")).toBe("webp");
  });

  it("rejects SVG, GIF, AVIF, video, unknown, and blank MIME", () => {
    for (const type of [
      "image/svg+xml",
      "image/gif",
      "image/avif",
      "video/mp4",
      "application/octet-stream",
      "",
    ]) {
      const r = validatePlantProfilePhotoFile(f(type, 1024));
      expect(r.ok).toBe(false);
    }
  });

  it("rejects empty files", () => {
    const r = validatePlantProfilePhotoFile(f("image/jpeg", 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("accepts exactly 25 MB and rejects above", () => {
    const ok = validatePlantProfilePhotoFile(
      f("image/jpeg", PLANT_PROFILE_PHOTO_MAX_BYTES),
    );
    expect(ok.ok).toBe(true);
    const over = validatePlantProfilePhotoFile(
      f("image/jpeg", PLANT_PROFILE_PHOTO_MAX_BYTES + 1),
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("too-large");
  });

  it("never surfaces raw provider errors", () => {
    const bad = validatePlantProfilePhotoFile(f("image/svg+xml", 100));
    if (!bad.ok) {
      expect(bad.message).toBe("That file type is not supported.");
    }
  });
});

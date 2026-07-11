import { describe, it, expect } from "vitest";
import {
  plantProfilePhotoFormatBadge,
  plantProfilePhotoRequiresDecodeProbe,
  safePlantProfilePhotoFileName,
  PLANT_PROFILE_PHOTO_FALLBACK_COPY,
} from "@/lib/plantProfilePhotoPreviewRules";

describe("plantProfilePhotoFormatBadge", () => {
  it("returns HEIC / HEIF for the HEIC-family MIME types", () => {
    expect(plantProfilePhotoFormatBadge("image/heic")).toBe("HEIC");
    expect(plantProfilePhotoFormatBadge("IMAGE/HEIF")).toBe("HEIF");
  });
  it("returns null for standard web formats", () => {
    for (const m of ["image/jpeg", "image/png", "image/webp", "", null, undefined]) {
      expect(plantProfilePhotoFormatBadge(m as string)).toBeNull();
    }
  });
});

describe("plantProfilePhotoRequiresDecodeProbe", () => {
  it("only HEIC/HEIF require the browser decode probe", () => {
    expect(plantProfilePhotoRequiresDecodeProbe("image/heic")).toBe(true);
    expect(plantProfilePhotoRequiresDecodeProbe("image/heif")).toBe(true);
    expect(plantProfilePhotoRequiresDecodeProbe("image/jpeg")).toBe(false);
    expect(plantProfilePhotoRequiresDecodeProbe("image/png")).toBe(false);
    expect(plantProfilePhotoRequiresDecodeProbe("image/webp")).toBe(false);
  });
});

describe("safePlantProfilePhotoFileName", () => {
  it("strips path separators defensively", () => {
    expect(safePlantProfilePhotoFileName("/tmp/leaked/path/photo.heic")).toBe(
      "photo.heic",
    );
    expect(safePlantProfilePhotoFileName("C:\\Users\\x\\photo.heic")).toBe(
      "photo.heic",
    );
  });
  it("falls back to a format-labeled or generic name when empty", () => {
    expect(safePlantProfilePhotoFileName("", "image/heic")).toBe("HEIC photo");
    expect(safePlantProfilePhotoFileName(null)).toBe("Selected photo");
  });
  it("truncates absurdly long names", () => {
    const name = "a".repeat(200) + ".jpg";
    const out = safePlantProfilePhotoFileName(name);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("PLANT_PROFILE_PHOTO_FALLBACK_COPY", () => {
  it("browser-unsupported copy references the original photo", () => {
    expect(PLANT_PROFILE_PHOTO_FALLBACK_COPY.browser_decode_unsupported).toMatch(
      /original photo is ready to upload/,
    );
  });
  it("preview-error copy stays generic and grower-safe", () => {
    const msg = PLANT_PROFILE_PHOTO_FALLBACK_COPY.preview_error;
    expect(msg).toMatch(/still ready to upload/);
    // Never leak object URLs, storage paths, or provider errors.
    expect(msg).not.toMatch(/blob:|storage:\/\/|Error|undefined/i);
  });
});

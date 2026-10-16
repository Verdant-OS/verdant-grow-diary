/**
 * Pure rules for Quick Log PNG byte validation (#2162 support).
 */
import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_FAKE_PNG_MESSAGE,
  fileClaimsPng,
  hasPngSignature,
  validateQuickLogPngClaim,
} from "@/lib/quickLogPhotoContentRules";

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("quickLogPhotoContentRules", () => {
  describe("fileClaimsPng", () => {
    it("is true when the extension is .png", () => {
      expect(fileClaimsPng({ name: "leaf.PNG", type: "application/octet-stream" })).toBe(true);
    });

    it("is true when the MIME type is image/png even without a .png name", () => {
      expect(fileClaimsPng({ name: "upload", type: "image/png" })).toBe(true);
    });

    it("is false for a typical JPEG upload", () => {
      expect(fileClaimsPng({ name: "leaf.jpg", type: "image/jpeg" })).toBe(false);
    });
  });

  describe("hasPngSignature", () => {
    it("accepts a full PNG header", () => {
      expect(hasPngSignature(PNG_SIGNATURE)).toBe(true);
    });

    it("rejects a short or wrong header", () => {
      expect(hasPngSignature(new Uint8Array([0x89, 0x50]))).toBe(false);
      expect(
        hasPngSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b])),
      ).toBe(false);
    });
  });

  describe("validateQuickLogPngClaim", () => {
    it("passes through non-PNG claims without reading bytes", async () => {
      const jpeg = new File(["not png"], "x.jpg", { type: "image/jpeg" });
      await expect(validateQuickLogPngClaim(jpeg)).resolves.toEqual({ ok: true });
    });

    it("rejects text bytes on a .png name", async () => {
      const fake = new File(["plain text"], "fake.png", { type: "image/png" });
      await expect(validateQuickLogPngClaim(fake)).resolves.toEqual({
        ok: false,
        message: QUICK_LOG_FAKE_PNG_MESSAGE,
      });
    });

    it("accepts real PNG signature bytes", async () => {
      const real = new File([PNG_SIGNATURE], "leaf.png", { type: "image/png" });
      await expect(validateQuickLogPngClaim(real)).resolves.toEqual({ ok: true });
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_PHOTO_DECODE_MAX_PIXELS,
  AI_DOCTOR_PHOTO_DECODE_MAX_SIDE,
  AI_DOCTOR_PHOTO_PREVIEW_HEIGHT,
  AI_DOCTOR_PHOTO_PREVIEW_WIDTH,
  calculateRasterPhotoCoverCrop,
  isRasterPhotoPreviewBitmapWithinBounds,
} from "@/lib/rasterPhotoPreviewRules";

describe("isRasterPhotoPreviewBitmapWithinBounds", () => {
  it("accepts ordinary landscape and portrait preview bitmaps", () => {
    expect(isRasterPhotoPreviewBitmapWithinBounds(1280, 720)).toBe(true);
    expect(isRasterPhotoPreviewBitmapWithinBounds(1280, 2276)).toBe(true);
  });

  it("accepts the explicit side and pixel boundaries", () => {
    expect(
      isRasterPhotoPreviewBitmapWithinBounds(
        AI_DOCTOR_PHOTO_PREVIEW_WIDTH,
        AI_DOCTOR_PHOTO_DECODE_MAX_SIDE,
      ),
    ).toBe(true);
    expect(AI_DOCTOR_PHOTO_DECODE_MAX_PIXELS).toBe(
      AI_DOCTOR_PHOTO_PREVIEW_WIDTH * AI_DOCTOR_PHOTO_DECODE_MAX_SIDE,
    );
  });

  it("rejects oversized, invalid, and non-finite decoded dimensions", () => {
    expect(isRasterPhotoPreviewBitmapWithinBounds(1280, 8193)).toBe(false);
    expect(isRasterPhotoPreviewBitmapWithinBounds(4096, 4096)).toBe(false);
    expect(isRasterPhotoPreviewBitmapWithinBounds(0, 720)).toBe(false);
    expect(isRasterPhotoPreviewBitmapWithinBounds(Number.NaN, 720)).toBe(false);
    expect(isRasterPhotoPreviewBitmapWithinBounds(1280, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("is deterministic for identical dimensions", () => {
    const first = isRasterPhotoPreviewBitmapWithinBounds(1280, 2276);
    const second = isRasterPhotoPreviewBitmapWithinBounds(1280, 2276);
    expect(first).toBe(second);
  });
});

describe("calculateRasterPhotoCoverCrop", () => {
  it("keeps a matching 16:9 source uncropped", () => {
    expect(calculateRasterPhotoCoverCrop(1600, 900)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1600,
      sourceHeight: 900,
      targetWidth: AI_DOCTOR_PHOTO_PREVIEW_WIDTH,
      targetHeight: AI_DOCTOR_PHOTO_PREVIEW_HEIGHT,
    });
  });

  it("center-crops a portrait photo without stretching it", () => {
    const crop = calculateRasterPhotoCoverCrop(900, 1600);
    expect(crop).not.toBeNull();
    expect(crop?.sourceX).toBe(0);
    expect(crop?.sourceWidth).toBe(900);
    expect(crop?.sourceHeight).toBeCloseTo(506.25);
    expect(crop?.sourceY).toBeCloseTo(546.875);
  });

  it("center-crops an extra-wide photo without stretching it", () => {
    const crop = calculateRasterPhotoCoverCrop(2000, 1000);
    expect(crop).not.toBeNull();
    expect(crop?.sourceY).toBe(0);
    expect(crop?.sourceHeight).toBe(1000);
    expect(crop?.sourceWidth).toBeCloseTo(1777.7777778);
    expect(crop?.sourceX).toBeCloseTo(111.1111111);
  });

  it.each([
    [0, 100],
    [100, 0],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
    [100, 100, -1, 720],
  ])("fails closed for invalid dimensions", (width, height, targetWidth, targetHeight) => {
    expect(calculateRasterPhotoCoverCrop(width, height, targetWidth, targetHeight)).toBeNull();
  });

  it("is deterministic for identical dimensions", () => {
    const first = calculateRasterPhotoCoverCrop(3024, 4032);
    const second = calculateRasterPhotoCoverCrop(3024, 4032);
    expect(first).toEqual(second);
  });
});

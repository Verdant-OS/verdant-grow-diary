/**
 * Pure geometry for rendering a grower-selected photo into a fixed raster
 * preview. The browser adapter in Coach decodes the File to pixels and draws
 * only this crop to a canvas, so DOM-controlled file data is never assigned to
 * an HTML/URL sink.
 */

export const AI_DOCTOR_PHOTO_PREVIEW_WIDTH = 1280;
export const AI_DOCTOR_PHOTO_PREVIEW_HEIGHT = 720;
export const AI_DOCTOR_PHOTO_DECODE_MAX_SIDE = 8192;
export const AI_DOCTOR_PHOTO_DECODE_MAX_PIXELS =
  AI_DOCTOR_PHOTO_PREVIEW_WIDTH * AI_DOCTOR_PHOTO_DECODE_MAX_SIDE;

export interface RasterPhotoCoverCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Rejects extreme decoded dimensions before any pixels reach the preview
 * canvas. Coach also requests a width-bounded ImageBitmap; this second fence
 * keeps pathological aspect ratios from allocating an oversized canvas draw.
 */
export function isRasterPhotoPreviewBitmapWithinBounds(
  width: number,
  height: number,
  maxSide = AI_DOCTOR_PHOTO_DECODE_MAX_SIDE,
  maxPixels = AI_DOCTOR_PHOTO_DECODE_MAX_PIXELS,
): boolean {
  if (
    !isPositiveFinite(width) ||
    !isPositiveFinite(height) ||
    !isPositiveFinite(maxSide) ||
    !isPositiveFinite(maxPixels)
  ) {
    return false;
  }

  return width <= maxSide && height <= maxSide && width * height <= maxPixels;
}

/**
 * Returns a centered source crop that fills the requested target without
 * stretching. Invalid or non-finite dimensions fail closed.
 */
export function calculateRasterPhotoCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth = AI_DOCTOR_PHOTO_PREVIEW_WIDTH,
  targetHeight = AI_DOCTOR_PHOTO_PREVIEW_HEIGHT,
): RasterPhotoCoverCrop | null {
  if (
    !isPositiveFinite(sourceWidth) ||
    !isPositiveFinite(sourceHeight) ||
    !isPositiveFinite(targetWidth) ||
    !isPositiveFinite(targetHeight)
  ) {
    return null;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const sourceCropWidth = sourceHeight * targetAspect;
    return {
      sourceX: (sourceWidth - sourceCropWidth) / 2,
      sourceY: 0,
      sourceWidth: sourceCropWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
    };
  }

  const sourceCropHeight = sourceWidth / targetAspect;
  return {
    sourceX: 0,
    sourceY: (sourceHeight - sourceCropHeight) / 2,
    sourceWidth,
    sourceHeight: sourceCropHeight,
    targetWidth,
    targetHeight,
  };
}

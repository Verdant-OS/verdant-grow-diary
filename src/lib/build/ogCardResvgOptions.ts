/**
 * Shared, host-independent Resvg options for Verdant's generated OG cards.
 *
 * Loading a bundled Inter subset keeps production artifacts and pixel tests
 * identical across Windows, macOS, and Linux. System fonts are deliberately
 * disabled: a runner image update must not silently change public card text.
 */
import { resolve } from "node:path";

import type { ResvgRenderOptions } from "@resvg/resvg-js";

import { OG_IMAGE_WIDTH } from "./ogImageCard";

export const OG_CARD_FONT_FAMILY = "Inter";

const OG_CARD_FONT_FILES = Object.freeze([
  resolve("assets/fonts/inter/Inter-Regular.ttf"),
  resolve("assets/fonts/inter/Inter-SemiBold.ttf"),
  resolve("assets/fonts/inter/Inter-Bold.ttf"),
]);

/** Returns a fresh options object so callers cannot mutate shared state. */
export function createOgCardResvgOptions(): ResvgRenderOptions {
  return {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: {
      loadSystemFonts: false,
      fontFiles: [...OG_CARD_FONT_FILES],
      defaultFontFamily: OG_CARD_FONT_FAMILY,
      sansSerifFamily: OG_CARD_FONT_FAMILY,
    },
  };
}

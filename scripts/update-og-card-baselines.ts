#!/usr/bin/env bun
/**
 * update-og-card-baselines
 *
 * Records the stored OG card baseline PNGs used by
 * `src/test/og-card-pixel-regression.test.ts`.
 *
 * Run this ONLY when the card template changed on purpose, and review the
 * resulting PNGs by eye before committing them. Re-recording a baseline to
 * make a red gate go green destroys the gate's entire value.
 *
 * Usage: bun run scripts/update-og-card-baselines.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { OG_CARD_BASELINE_CASES } from "../src/lib/build/ogCardPixelDiff";
import { buildOgCardSvg, OG_IMAGE_WIDTH } from "../src/lib/build/ogImageCard";

const baselineDir = resolve("src/test/fixtures/og-card-baselines");
mkdirSync(baselineDir, { recursive: true });

for (const testCase of OG_CARD_BASELINE_CASES) {
  const png = new Resvg(buildOgCardSvg(testCase), {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();
  const target = join(baselineDir, `${testCase.slug}.png`);
  writeFileSync(target, png);
  console.log(`update-og-card-baselines: wrote ${target} (${png.length} bytes)`);
}

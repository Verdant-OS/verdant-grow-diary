/**
 * ogCardPixelDiff — pure pixel comparison helpers for the generated OG cards.
 *
 * Why this is not a naive "bytes must match the baseline" check:
 * `scripts/generate-seo-artifacts.ts` rasterizes the card with resvg using
 * `loadSystemFonts: true`, so the exact glyph raster depends on which sans
 * font the host happens to provide. A byte-for-byte baseline would go red on
 * every machine that is not the one that recorded it — a gate that cries wolf
 * gets disabled, and then real regressions ship.
 *
 * So the comparison is split into two lanes with different strictness:
 *
 *   1. CHROME (everything outside the text bands) is compared per channel with
 *      a tiny tolerance. This is the background gradient, the accent bar, the
 *      decorative glows and the card edges — nothing here depends on fonts, so
 *      a change means the template really did change.
 *
 *   2. TEXT BANDS are compared by *ink coverage* — the fraction of pixels in
 *      the band that are lighter than the dark card surface. This catches the
 *      failures that matter (text vanished entirely, text overflowed into the
 *      wrong band, a wrapping change doubled the rendered lines) without
 *      asserting glyph identity across font stacks.
 *
 * A mismatch reports which lane failed, so a maintainer can tell a template
 * regression from a font-substitution difference instead of guessing.
 *
 * All functions here are pure and deterministic: pixels in, verdict out. No
 * filesystem, no rendering, no network.
 */

import { inflateSync } from "node:zlib";

import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "./ogImageCard";

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits per channel, row-major, length = width * height * 4. */
  readonly pixels: Uint8Array;
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function signatureMatches(buffer: Uint8Array): boolean {
  if (buffer.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Minimal PNG decoder for the subset resvg emits: 8-bit, non-interlaced,
 * colour type 2 (RGB) or 6 (RGBA). Anything else throws rather than guessing —
 * a silently mis-decoded baseline is worse than no baseline.
 */
export function decodePng(buffer: Uint8Array): DecodedPng {
  if (!signatureMatches(buffer)) {
    throw new Error("decodePng: not a PNG (signature mismatch)");
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let sawIhdr = false;
  const idatChunks: Uint8Array[] = [];

  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4]!,
      buffer[offset + 5]!,
      buffer[offset + 6]!,
      buffer[offset + 7]!,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) {
      throw new Error(`decodePng: truncated ${type} chunk`);
    }

    if (type === "IHDR") {
      sawIhdr = true;
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = buffer[dataStart + 8]!;
      colorType = buffer[dataStart + 9]!;
      interlace = buffer[dataStart + 12]!;
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  if (!sawIhdr) throw new Error("decodePng: missing IHDR chunk");
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth} (expected 8)`);
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`decodePng: unsupported colour type ${colorType} (expected 2 or 6)`);
  }
  if (interlace !== 0) throw new Error("decodePng: interlaced PNGs are not supported");
  if (idatChunks.length === 0) throw new Error("decodePng: no IDAT data");

  const channels = colorType === 6 ? 4 : 3;
  const raw = new Uint8Array(inflateSync(Buffer.concat(idatChunks.map((c) => Buffer.from(c)))));
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new Error(`decodePng: inflated ${raw.length} bytes, expected ${expected}`);
  }

  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const rowStart = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const rawByte = raw[rowStart + i]!;
      const left = i >= channels ? line[i - channels]! : 0;
      const up = previous[i]!;
      const upLeft = i >= channels ? previous[i - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4:
          value = rawByte + paethPredictor(left, up, upLeft);
          break;
        default:
          throw new Error(`decodePng: unknown row filter ${filter} on row ${y}`);
      }
      line[i] = value & 0xff;
    }
    previous.set(line);

    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = line[src]!;
      out[dst + 1] = line[src + 1]!;
      out[dst + 2] = line[src + 2]!;
      out[dst + 3] = channels === 4 ? line[src + 3]! : 255;
    }
  }

  return { width, height, pixels: out };
}

export interface PixelRegion {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Horizontal bands that contain rendered text in the current card template.
 * Derived from `buildOgCardSvg`: wordmark + tagline + category badge at the
 * top, wrapped title and description through the middle, footer line at the
 * bottom. Kept as full-width bands deliberately — a wrapping change that
 * shifts a line sideways must not slip through a tightly-fitted box.
 */
export const OG_CARD_TEXT_BANDS: readonly PixelRegion[] = Object.freeze([
  Object.freeze({ name: "header", x: 0, y: 70, width: OG_IMAGE_WIDTH, height: 145 }),
  Object.freeze({ name: "body", x: 0, y: 215, width: OG_IMAGE_WIDTH, height: 340 }),
  Object.freeze({ name: "footer", x: 0, y: 555, width: OG_IMAGE_WIDTH, height: 45 }),
]);

/**
 * Pixels lighter than this (0-255 luminance) count as "ink" against the dark
 * card surface. The darkest surface stop is #0b1f16 (luminance ≈ 25) and the
 * dimmest text colour is #86efac at 0.6 opacity over it (≈ 100), so 60 sits
 * clear of both.
 */
export const INK_LUMINANCE_THRESHOLD = 60;

/** Per-channel tolerance for chrome pixels; absorbs rasterizer rounding only. */
export const CHROME_CHANNEL_TOLERANCE = 4;

/** Chrome pixels allowed to exceed the channel tolerance, as a fraction. */
export const CHROME_MISMATCH_BUDGET = 0.0005;

/** Allowed relative drift in a text band's ink coverage. */
export const INK_COVERAGE_TOLERANCE = 0.35;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bandMembership(width: number, height: number, bands: readonly PixelRegion[]): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const band of bands) {
    const yStart = Math.max(0, band.y);
    const yEnd = Math.min(height, band.y + band.height);
    const xStart = Math.max(0, band.x);
    const xEnd = Math.min(width, band.x + band.width);
    for (let y = yStart; y < yEnd; y += 1) {
      mask.fill(1, y * width + xStart, y * width + xEnd);
    }
  }
  return mask;
}

/** Fraction of pixels inside `region` whose luminance clears the ink threshold. */
export function inkCoverage(image: DecodedPng, region: PixelRegion): number {
  const yStart = Math.max(0, region.y);
  const yEnd = Math.min(image.height, region.y + region.height);
  const xStart = Math.max(0, region.x);
  const xEnd = Math.min(image.width, region.x + region.width);
  const total = Math.max(0, yEnd - yStart) * Math.max(0, xEnd - xStart);
  if (total === 0) return 0;

  let ink = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const index = (y * image.width + x) * 4;
      if (
        luminance(image.pixels[index]!, image.pixels[index + 1]!, image.pixels[index + 2]!) >
        INK_LUMINANCE_THRESHOLD
      ) {
        ink += 1;
      }
    }
  }
  return ink / total;
}

export interface BandCoverageResult {
  readonly name: string;
  readonly baseline: number;
  readonly candidate: number;
  readonly ok: boolean;
}

export interface OgCardPixelComparison {
  readonly ok: boolean;
  /** Fraction of chrome pixels that exceeded the per-channel tolerance. */
  readonly chromeMismatchRatio: number;
  readonly chromeMismatchCount: number;
  readonly chromePixelCount: number;
  /** First few offending chrome pixels, for a readable failure message. */
  readonly chromeSamples: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly baseline: readonly [number, number, number, number];
    readonly candidate: readonly [number, number, number, number];
  }>;
  readonly bands: readonly BandCoverageResult[];
  readonly problems: readonly string[];
}

export interface CompareOptions {
  readonly bands?: readonly PixelRegion[];
  readonly chromeChannelTolerance?: number;
  readonly chromeMismatchBudget?: number;
  readonly inkCoverageTolerance?: number;
}

/**
 * Compares a freshly rendered card against its stored baseline.
 * Dimension mismatches fail immediately — comparing pixel grids of different
 * shapes would produce meaningless coordinates.
 */
export function compareOgCardPixels(
  baseline: DecodedPng,
  candidate: DecodedPng,
  options: CompareOptions = {},
): OgCardPixelComparison {
  const bands = options.bands ?? OG_CARD_TEXT_BANDS;
  const channelTolerance = options.chromeChannelTolerance ?? CHROME_CHANNEL_TOLERANCE;
  const mismatchBudget = options.chromeMismatchBudget ?? CHROME_MISMATCH_BUDGET;
  const coverageTolerance = options.inkCoverageTolerance ?? INK_COVERAGE_TOLERANCE;
  const problems: string[] = [];

  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return {
      ok: false,
      chromeMismatchRatio: 1,
      chromeMismatchCount: 0,
      chromePixelCount: 0,
      chromeSamples: [],
      bands: [],
      problems: [
        `dimensions differ: baseline ${baseline.width}×${baseline.height}, ` +
          `candidate ${candidate.width}×${candidate.height}.`,
      ],
    };
  }

  const { width, height } = baseline;
  const mask = bandMembership(width, height, bands);
  const chromeSamples: Array<{
    x: number;
    y: number;
    baseline: [number, number, number, number];
    candidate: [number, number, number, number];
  }> = [];

  let chromePixelCount = 0;
  let chromeMismatchCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (mask[pixel] === 1) continue;
      chromePixelCount += 1;
      const index = pixel * 4;
      let differs = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (
          Math.abs(baseline.pixels[index + channel]! - candidate.pixels[index + channel]!) >
          channelTolerance
        ) {
          differs = true;
          break;
        }
      }
      if (!differs) continue;
      chromeMismatchCount += 1;
      if (chromeSamples.length < 5) {
        chromeSamples.push({
          x,
          y,
          baseline: [
            baseline.pixels[index]!,
            baseline.pixels[index + 1]!,
            baseline.pixels[index + 2]!,
            baseline.pixels[index + 3]!,
          ],
          candidate: [
            candidate.pixels[index]!,
            candidate.pixels[index + 1]!,
            candidate.pixels[index + 2]!,
            candidate.pixels[index + 3]!,
          ],
        });
      }
    }
  }

  const chromeMismatchRatio = chromePixelCount === 0 ? 0 : chromeMismatchCount / chromePixelCount;
  if (chromeMismatchRatio > mismatchBudget) {
    problems.push(
      `chrome (non-text) pixels drifted: ${chromeMismatchCount}/${chromePixelCount} ` +
        `(${(chromeMismatchRatio * 100).toFixed(4)}%) exceed ±${channelTolerance} per channel, ` +
        `budget ${(mismatchBudget * 100).toFixed(4)}%. Chrome does not depend on host fonts, so ` +
        `this is a real template/render regression, not font substitution.`,
    );
  }

  const bandResults: BandCoverageResult[] = bands.map((band) => {
    const baselineCoverage = inkCoverage(baseline, band);
    const candidateCoverage = inkCoverage(candidate, band);
    const allowed = Math.max(baselineCoverage * coverageTolerance, 0.002);
    const ok = Math.abs(candidateCoverage - baselineCoverage) <= allowed;
    if (!ok) {
      problems.push(
        `text band "${band.name}" ink coverage ${(candidateCoverage * 100).toFixed(3)}% vs ` +
          `baseline ${(baselineCoverage * 100).toFixed(3)}% (tolerance ±${(
            coverageTolerance * 100
          ).toFixed(0)}%). Either the card's text changed/vanished/overflowed, or this host ` +
          `renders a very different sans font than the baseline was recorded with.`,
      );
    }
    return { name: band.name, baseline: baselineCoverage, candidate: candidateCoverage, ok };
  });

  return {
    ok: problems.length === 0,
    chromeMismatchRatio,
    chromeMismatchCount,
    chromePixelCount,
    chromeSamples,
    bands: bandResults,
    problems,
  };
}

export interface OgCardBaselineCase {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly path: string;
}

/**
 * Fixed inputs the baselines are recorded from. Deliberately literal — they
 * must never be derived from the live route manifest, or adding a route would
 * silently rewrite what the gate compares against.
 */
export const OG_CARD_BASELINE_CASES: readonly OgCardBaselineCase[] = Object.freeze([
  Object.freeze({
    slug: "home",
    title: "Verdant Grow Diary — plant memory and sensor truth",
    description:
      "Log your grow, attach real sensor readings, and get cautious AI guidance you approve before anything happens.",
    path: "/",
  }),
  Object.freeze({
    slug: "guide-long-title",
    title:
      "Bud rot (Botrytis) identification: early signs, humidity thresholds, and what not to do in late flower",
    description:
      "How to spot Botrytis before it spreads, which environmental readings actually matter, and the recovery steps that make things worse.",
    path: "/guides/bud-rot-identification",
  }),
  Object.freeze({
    slug: "short-copy",
    title: "Pricing",
    description: "Simple plans for serious home growers.",
    path: "/pricing",
  }),
]);

/** Height/width the baselines are recorded at; re-exported for gate scripts. */
export const OG_CARD_BASELINE_WIDTH = OG_IMAGE_WIDTH;
export const OG_CARD_BASELINE_HEIGHT = OG_IMAGE_HEIGHT;

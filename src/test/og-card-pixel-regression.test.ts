/**
 * OG card pixel regression gate.
 *
 * Renders the fixed baseline cases through the real card pipeline
 * (buildOgCardSvg -> resvg, same options as scripts/generate-seo-artifacts.ts)
 * and compares the result against the stored baseline PNGs in
 * src/test/fixtures/og-card-baselines/.
 *
 * Comparison strictness is split by lane — see src/lib/build/ogCardPixelDiff.ts
 * for why. Chrome (background gradient, accent bar, glows, edges) is compared
 * near-exactly; text bands are compared by ink coverage so the gate survives
 * host font substitution without going blind to text that vanished, doubled,
 * or overflowed its band.
 *
 * Regenerate baselines ONLY for an intentional template change:
 *   bun run scripts/update-og-card-baselines.ts
 * and eyeball the PNGs before committing them.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";

import {
  CHROME_CHANNEL_TOLERANCE,
  compareOgCardPixels,
  decodePng,
  inkCoverage,
  OG_CARD_BASELINE_CASES,
  OG_CARD_BASELINE_HEIGHT,
  OG_CARD_BASELINE_WIDTH,
  OG_CARD_TEXT_BANDS,
  type DecodedPng,
} from "@/lib/build/ogCardPixelDiff";
import { buildOgCardSvg, OG_IMAGE_WIDTH } from "@/lib/build/ogImageCard";

const BASELINE_DIR = resolve("src/test/fixtures/og-card-baselines");

function renderCardPng(input: { title: string; description: string; path: string }): Buffer {
  return new Resvg(buildOgCardSvg(input), {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();
}

/** Solid-colour RGBA image helper for the diff-logic unit tests. */
function solidImage(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): DecodedPng {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = rgba[0];
    pixels[i * 4 + 1] = rgba[1];
    pixels[i * 4 + 2] = rgba[2];
    pixels[i * 4 + 3] = rgba[3];
  }
  return { width, height, pixels };
}

function withPixel(
  image: DecodedPng,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): DecodedPng {
  const pixels = Uint8Array.from(image.pixels);
  const index = (y * image.width + x) * 4;
  pixels[index] = rgba[0];
  pixels[index + 1] = rgba[1];
  pixels[index + 2] = rgba[2];
  pixels[index + 3] = rgba[3];
  return { ...image, pixels };
}

describe("og card baseline fixtures", () => {
  it("has a stored baseline PNG for every declared case", () => {
    const missing = OG_CARD_BASELINE_CASES.filter(
      (testCase) => !existsSync(join(BASELINE_DIR, `${testCase.slug}.png`)),
    ).map((testCase) => testCase.slug);

    expect(
      missing,
      `Missing baselines: ${missing.join(", ")}. Run: bun run scripts/update-og-card-baselines.ts`,
    ).toEqual([]);
  });

  it("declares at least one case and unique slugs", () => {
    expect(OG_CARD_BASELINE_CASES.length).toBeGreaterThan(0);
    const slugs = OG_CARD_BASELINE_CASES.map((testCase) => testCase.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("decodes each baseline at the declared card resolution", () => {
    for (const testCase of OG_CARD_BASELINE_CASES) {
      const decoded = decodePng(readFileSync(join(BASELINE_DIR, `${testCase.slug}.png`)));
      expect(decoded.width, testCase.slug).toBe(OG_CARD_BASELINE_WIDTH);
      expect(decoded.height, testCase.slug).toBe(OG_CARD_BASELINE_HEIGHT);
      expect(decoded.pixels.length).toBe(decoded.width * decoded.height * 4);
    }
  });

  it("baselines are not blank — every text band carries ink", () => {
    for (const testCase of OG_CARD_BASELINE_CASES) {
      const decoded = decodePng(readFileSync(join(BASELINE_DIR, `${testCase.slug}.png`)));
      for (const band of OG_CARD_TEXT_BANDS) {
        expect(
          inkCoverage(decoded, band),
          `${testCase.slug} band ${band.name} has no ink; the baseline itself is broken`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("og card pixel regression against stored baselines", () => {
  for (const testCase of OG_CARD_BASELINE_CASES) {
    it(`renders "${testCase.slug}" matching its baseline`, () => {
      const baselinePath = join(BASELINE_DIR, `${testCase.slug}.png`);
      const baseline = decodePng(readFileSync(baselinePath));
      const renderedBytes = renderCardPng(testCase);
      const candidate = decodePng(renderedBytes);

      const result = compareOgCardPixels(baseline, candidate);

      if (!result.ok) {
        // Persist the failing render outside the repo so a maintainer can look
        // at it. Never written to the fixtures dir — a failing gate must not
        // be able to overwrite its own baseline.
        const dir = mkdtempSync(join(tmpdir(), "og-card-diff-"));
        const actualPath = join(dir, `${testCase.slug}.actual.png`);
        writeFileSync(actualPath, renderedBytes);
        const samples = result.chromeSamples
          .map((s) => `    (${s.x},${s.y}) baseline ${s.baseline} vs candidate ${s.candidate}`)
          .join("\n");
        throw new Error(
          `OG card "${testCase.slug}" drifted from its baseline:\n  - ` +
            result.problems.join("\n  - ") +
            (samples ? `\n  chrome samples:\n${samples}` : "") +
            `\n  baseline: ${baselinePath}\n  actual:   ${actualPath}\n` +
            `  If the template changed on purpose, re-record with ` +
            `\`bun run scripts/update-og-card-baselines.ts\` and review the PNGs.`,
        );
      }

      expect(result.ok).toBe(true);
    });
  }

  it("is deterministic — rendering the same input twice is byte-identical", () => {
    const [first] = OG_CARD_BASELINE_CASES;
    expect(renderCardPng(first!).equals(renderCardPng(first!))).toBe(true);
  });
});

describe("compareOgCardPixels", () => {
  const base = solidImage(40, 40, [10, 20, 15, 255]);
  const bands = [{ name: "band", x: 0, y: 20, width: 40, height: 20 }] as const;

  it("passes for identical images", () => {
    const result = compareOgCardPixels(base, base, { bands });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.chromePixelCount).toBe(40 * 20);
  });

  it("fails when dimensions differ", () => {
    const result = compareOgCardPixels(base, solidImage(40, 41, [10, 20, 15, 255]), { bands });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("dimensions differ");
  });

  it("tolerates sub-threshold chrome rounding", () => {
    const nudged = withPixel(base, 5, 5, [10 + CHROME_CHANNEL_TOLERANCE, 20, 15, 255]);
    expect(compareOgCardPixels(base, nudged, { bands }).ok).toBe(true);
  });

  it("fails on a chrome colour change beyond the mismatch budget", () => {
    // Repaint the whole chrome region a different colour.
    const changed = solidImage(40, 40, [90, 20, 15, 255]);
    const result = compareOgCardPixels(base, changed, { bands });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("chrome (non-text) pixels drifted");
    expect(result.chromeMismatchCount).toBe(40 * 20);
    expect(result.chromeSamples.length).toBeGreaterThan(0);
  });

  it("ignores glyph-level differences inside a text band", () => {
    // Same ink coverage, different pixel positions — a font substitution.
    let baselineImage = base;
    let candidateImage = base;
    for (let x = 0; x < 10; x += 1) {
      baselineImage = withPixel(baselineImage, x, 25, [255, 255, 255, 255]);
      candidateImage = withPixel(candidateImage, x + 15, 30, [255, 255, 255, 255]);
    }
    expect(compareOgCardPixels(baselineImage, candidateImage, { bands }).ok).toBe(true);
  });

  it("fails when text disappears from a band", () => {
    let baselineImage = base;
    for (let y = 20; y < 40; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        baselineImage = withPixel(baselineImage, x, y, [255, 255, 255, 255]);
      }
    }
    const result = compareOgCardPixels(baselineImage, base, { bands });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain('text band "band" ink coverage');
    expect(result.bands[0]?.candidate).toBe(0);
  });

  it("fails when a band gains far more ink than the baseline", () => {
    let candidateImage = base;
    for (let y = 20; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        candidateImage = withPixel(candidateImage, x, y, [255, 255, 255, 255]);
      }
    }
    expect(compareOgCardPixels(base, candidateImage, { bands }).ok).toBe(false);
  });

  it("treats text-band pixels as exempt from the chrome lane", () => {
    const inBand = withPixel(base, 0, 25, [255, 255, 255, 255]);
    expect(compareOgCardPixels(base, inBand, { bands }).chromeMismatchCount).toBe(0);
  });
});

describe("decodePng", () => {
  it("rejects a non-PNG buffer", () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3, 4]))).toThrow(/not a PNG/);
  });

  it("rejects a truncated PNG", () => {
    const bytes = readFileSync(join(BASELINE_DIR, `${OG_CARD_BASELINE_CASES[0]!.slug}.png`));
    expect(() => decodePng(bytes.subarray(0, 60))).toThrow();
  });

  it("round-trips a real card render", () => {
    const decoded = decodePng(renderCardPng(OG_CARD_BASELINE_CASES[0]!));
    expect(decoded.width).toBe(OG_CARD_BASELINE_WIDTH);
    expect(decoded.height).toBe(OG_CARD_BASELINE_HEIGHT);
    // Top-left corner is the accent bar, which is bright green.
    expect(decoded.pixels[1]!).toBeGreaterThan(100);
  });
});

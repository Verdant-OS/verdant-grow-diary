#!/usr/bin/env node
/**
 * assert-og-card-dimensions
 *
 * Precondition gate for the generated Open Graph cards.
 *
 * `scripts/generate-seo-artifacts.ts` rasterizes one PNG per manifest document
 * into dist/client/og/<slug>.png. File-size checks alone cannot catch a broken
 * render: a partially-configured resvg run still emits a syntactically valid
 * PNG of the wrong size (or a 1×1 placeholder), which social platforms reject
 * or crop badly.
 *
 * This gate reads each PNG's IHDR chunk directly — no image dependency — and
 * asserts:
 *
 *   1. the file exists and is a real PNG (8-byte signature + IHDR first),
 *   2. its pixel dimensions match the declared OG card resolution exactly,
 *   3. its bit depth / colour type are a sane raster (not a 0-dimension stub).
 *
 * This script never generates or repairs artifacts — it only reports.
 *
 * Usage: node scripts/assert-og-card-dimensions.mjs [distDir]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Must stay in sync with OG_IMAGE_WIDTH / OG_IMAGE_HEIGHT in src/lib/build/ogImageCard.ts. */
export const EXPECTED_OG_WIDTH = 1200;
export const EXPECTED_OG_HEIGHT = 630;

/**
 * Encoding contract for the rasterized cards.
 *
 * resvg emits 8-bit RGBA (colour type 6). Colour type 2 (8-bit RGB) is also
 * accepted because a lossless optimiser may legitimately drop a fully-opaque
 * alpha channel. Everything else — palette (3), greyscale (0/4), or 16-bit
 * channels — means the rasterizer fell back or a post-processing step
 * re-encoded the card, which social scrapers render inconsistently.
 */
export const EXPECTED_OG_BIT_DEPTH = 8;
export const ALLOWED_OG_COLOR_TYPES = [2, 6];

/** Human labels for PNG colour types, used in failure messages. */
export const PNG_COLOR_TYPE_LABELS = {
  0: "greyscale",
  2: "RGB",
  3: "palette",
  4: "greyscale+alpha",
  6: "RGBA",
};

/** A real 1200×630 card is far larger; this only catches truncated writes. */
const MINIMUM_CARD_BYTES = 1024;


const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message) {
  console.error(`assert-og-card-dimensions: FAIL — ${message}`);
  process.exit(1);
}

/**
 * Mirrors `ogImageSlugForPath` from src/lib/build/ogImageCard.ts. Duplicated here
 * because build gates are plain .mjs and must not import TypeScript sources.
 */
export function ogSlugForPath(path) {
  if (path === "/") return "home";
  if (!path.startsWith("/")) {
    throw new Error(`ogSlugForPath requires an absolute path: ${path}`);
  }
  return path
    .slice(1)
    .replace(/[^a-zA-Z0-9/_-]/g, "-")
    .replace(/\//g, "--")
    .toLowerCase();
}

/**
 * Reads the PNG header of `buffer`.
 * Returns `{ ok: true, width, height, bitDepth, colorType }` or `{ ok: false, reason }`.
 */
export function readPngHeader(buffer) {
  if (buffer.length < 33) {
    return { ok: false, reason: `file is ${buffer.length} bytes; too short to contain a PNG header` };
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: "missing PNG signature (file is not a PNG)" };
  }
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    return { ok: false, reason: "first chunk is not IHDR (corrupt PNG header)" };
  }
  return {
    ok: true,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
  };
}

/**
 * Validate every manifest document's OG card inside `distDir`.
 * Exported so tests can exercise it without spawning a process.
 */
export function validateOgCardDimensions(distDir) {
  const problems = [];
  const manifestPath = join(distDir, "seo-manifest.json");

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      checked: 0,
      total: 0,
      problems: [`${manifestPath} missing; run the postbuild SEO generation first.`],
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      checked: 0,
      total: 0,
      problems: [
        `${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : error}`,
      ],
    };
  }

  const documents = Array.isArray(manifest?.documents) ? manifest.documents : [];
  if (documents.length === 0) {
    return {
      ok: false,
      checked: 0,
      total: 0,
      problems: [`${manifestPath} lists no documents; the OG card gate would vacuously pass.`],
    };
  }

  const seen = new Set();
  let checked = 0;

  for (const document of documents) {
    const canonical = document?.metadata?.url;
    let canonicalPath;
    try {
      canonicalPath = new URL(canonical).pathname;
    } catch {
      problems.push(
        `${document?.path ?? "(unknown route)"}: canonical URL ${JSON.stringify(canonical)} is not absolute; ` +
          `cannot resolve its OG card slug.`,
      );
      continue;
    }

    const slug = ogSlugForPath(canonicalPath);
    if (seen.has(slug)) continue;
    seen.add(slug);

    const cardPath = join(distDir, "client/og", `${slug}.png`);
    const label = `${document?.path ?? canonicalPath} -> ${cardPath}`;

    if (!existsSync(cardPath) || !statSync(cardPath).isFile()) {
      problems.push(`${label}: OG card missing.`);
      continue;
    }

    const size = statSync(cardPath).size;
    if (size < MINIMUM_CARD_BYTES) {
      problems.push(
        `${label}: OG card is ${size} bytes (< ${MINIMUM_CARD_BYTES}); the render was truncated.`,
      );
      continue;
    }

    const header = readPngHeader(readFileSync(cardPath));
    if (!header.ok) {
      problems.push(`${label}: ${header.reason}.`);
      continue;
    }

    if (header.width !== EXPECTED_OG_WIDTH || header.height !== EXPECTED_OG_HEIGHT) {
      problems.push(
        `${label}: OG card is ${header.width}×${header.height}; expected ` +
          `${EXPECTED_OG_WIDTH}×${EXPECTED_OG_HEIGHT}. A wrong-resolution render means the ` +
          `rasterizer fell back or the card template changed without updating this gate.`,
      );
      continue;
    }

    if (header.bitDepth < 8) {
      problems.push(
        `${label}: OG card bit depth is ${header.bitDepth}; expected at least 8 bits per channel.`,
      );
      continue;
    }

    checked += 1;
  }

  return { ok: problems.length === 0, checked, total: seen.size, problems };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");

  if (!existsSync(distDir)) {
    fail(`build output directory missing at ${distDir}. Run \`bun run build\` first.`);
  }

  const { ok, checked, total, problems } = validateOgCardDimensions(distDir);

  if (!ok) {
    fail(`${problems.length} OG card problem(s) in ${distDir}:\n  - ` + problems.join("\n  - "));
  }

  console.log(
    `assert-og-card-dimensions: OK — ${checked}/${total} OG card(s) present at ` +
      `${EXPECTED_OG_WIDTH}×${EXPECTED_OG_HEIGHT}.`,
  );
}

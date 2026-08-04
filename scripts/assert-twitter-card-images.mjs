#!/usr/bin/env node
/**
 * assert-twitter-card-images
 *
 * Postbuild gate for the Twitter/X card images referenced by every built
 * document's `twitter:image` meta tag.
 *
 * `validate-og-image-urls` already checks that each og:image / twitter:image
 * URL is absolute, same-origin, and 1200x630. This gate is narrower and
 * stricter, and it targets the failure modes that only surface on X:
 *
 *   1. `twitter:image` must actually be declared (a document with a
 *      `twitter:card` but no image silently downgrades to a text-only card).
 *   2. The referenced file must resolve inside dist and be a real PNG —
 *      signature, IHDR first, and a terminating IEND chunk, so a truncated
 *      write is caught rather than served as a broken card.
 *   3. Exact resolution 1200x630 (X crops/downgrades anything else).
 *   4. PNG *encoding* must be renderable by X's scraper: bit depth 8,
 *      truecolour or truecolour+alpha (colour type 2 or 6), deflate
 *      compression, adaptive filtering, and non-interlaced. Palette,
 *      greyscale, 16-bit, and Adam7-interlaced PNGs are the encodings that
 *      have historically rendered blank or mis-coloured on X.
 *   5. Byte size within X's 5 MB card-image limit, and above a floor that
 *      catches truncated renders.
 *
 * This script only reports; it never generates or repairs artifacts.
 *
 * Usage: node scripts/assert-twitter-card-images.mjs [distDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Must stay in sync with OG_IMAGE_WIDTH / OG_IMAGE_HEIGHT in src/lib/build/ogImageCard.ts. */
export const EXPECTED_TWITTER_CARD_WIDTH = 1200;
export const EXPECTED_TWITTER_CARD_HEIGHT = 630;

/** X rejects card images above 5 MB. */
export const MAX_TWITTER_CARD_BYTES = 5 * 1024 * 1024;
/** A real 1200x630 card is far larger; this only catches truncated writes. */
export const MIN_TWITTER_CARD_BYTES = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ALLOWED_COLOR_TYPES = new Set([2, 6]);

const TWITTER_IMAGE_REGEX =
  /<meta\s+(?:name|property)=["']twitter:image["']\s+content=["']([^"']+)["'][^>]*\/?>/gi;
const TWITTER_CARD_REGEX =
  /<meta\s+(?:name|property)=["']twitter:card["']\s+content=["']([^"']+)["'][^>]*\/?>/gi;

/**
 * Recursively collect every *.html file under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectHtmlFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules") continue;
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) walk(full);
      else if (stats.isFile() && full.toLowerCase().endsWith(".html")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * @param {string} html
 * @returns {{ images: string[]; cards: string[] }}
 */
export function extractTwitterCardMeta(html) {
  const images = [...html.matchAll(TWITTER_IMAGE_REGEX)].map((match) => match[1]);
  const cards = [...html.matchAll(TWITTER_CARD_REGEX)].map((match) => match[1].toLowerCase());
  return { images, cards };
}

/**
 * Parse the IHDR of a PNG buffer and confirm the stream terminates with IEND.
 * @param {Buffer} buffer
 * @returns {{ ok: true; width: number; height: number; bitDepth: number; colorType: number; compression: number; filter: number; interlace: number } | { ok: false; reason: string }}
 */
export function readPngEncoding(buffer) {
  if (buffer.length < 45) {
    return { ok: false, reason: `file is ${buffer.length} bytes; too short to be a valid PNG` };
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: "missing PNG signature (file is not a PNG)" };
  }
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    return { ok: false, reason: "first chunk is not IHDR (corrupt PNG header)" };
  }
  if (buffer.subarray(buffer.length - 8, buffer.length - 4).toString("ascii") !== "IEND") {
    return { ok: false, reason: "PNG stream does not end with an IEND chunk (truncated write)" };
  }
  return {
    ok: true,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
    compression: buffer.readUInt8(26),
    filter: buffer.readUInt8(27),
    interlace: buffer.readUInt8(28),
  };
}

/**
 * Validate one twitter:image URL against dist.
 * @param {{ distDir: string; url: string }} args
 * @returns {string[]} problem messages (empty when valid)
 */
export function validateTwitterCardImage({ distDir, url }) {
  const problems = [];

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [`twitter:image ${JSON.stringify(url)} is not an absolute URL.`];
  }

  const candidates = [join(distDir, parsed.pathname), join(distDir, "client", parsed.pathname)];
  const localPath = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!localPath) {
    return [`twitter:image ${url}: no file emitted at dist${parsed.pathname}.`];
  }

  const label = `${url} -> ${relative(distDir, localPath)}`;

  if (extname(localPath).toLowerCase() !== ".png") {
    return [`${label}: this gate requires PNG card images; got ${extname(localPath) || "(no extension)"}.`];
  }

  const size = statSync(localPath).size;
  if (size < MIN_TWITTER_CARD_BYTES) {
    return [`${label}: ${size} bytes (< ${MIN_TWITTER_CARD_BYTES}); the render was truncated.`];
  }
  if (size > MAX_TWITTER_CARD_BYTES) {
    problems.push(`${label}: ${size} bytes exceeds X's ${MAX_TWITTER_CARD_BYTES}-byte card limit.`);
  }

  const encoding = readPngEncoding(readFileSync(localPath));
  if (!encoding.ok) {
    problems.push(`${label}: ${encoding.reason}.`);
    return problems;
  }

  if (
    encoding.width !== EXPECTED_TWITTER_CARD_WIDTH ||
    encoding.height !== EXPECTED_TWITTER_CARD_HEIGHT
  ) {
    problems.push(
      `${label}: ${encoding.width}x${encoding.height}; expected ` +
        `${EXPECTED_TWITTER_CARD_WIDTH}x${EXPECTED_TWITTER_CARD_HEIGHT}. A wrong-resolution image is ` +
        `cropped or downgraded to a summary card on X.`,
    );
  }
  if (encoding.bitDepth !== 8) {
    problems.push(`${label}: PNG bit depth ${encoding.bitDepth}; expected 8.`);
  }
  if (!ALLOWED_COLOR_TYPES.has(encoding.colorType)) {
    problems.push(
      `${label}: PNG colour type ${encoding.colorType}; expected 2 (truecolour) or 6 (truecolour+alpha).`,
    );
  }
  if (encoding.compression !== 0) {
    problems.push(`${label}: PNG compression method ${encoding.compression}; expected 0 (deflate).`);
  }
  if (encoding.filter !== 0) {
    problems.push(`${label}: PNG filter method ${encoding.filter}; expected 0 (adaptive).`);
  }
  if (encoding.interlace !== 0) {
    problems.push(
      `${label}: PNG is Adam7-interlaced; X's scraper renders interlaced cards unreliably. Expected non-interlaced.`,
    );
  }

  return problems;
}

/**
 * Validate every document's Twitter card image inside `distDir`.
 * @param {string} distDir
 * @returns {{ ok: boolean; documents: number; checked: number; problems: string[] }}
 */
export function validateTwitterCardImages(distDir) {
  const problems = [];
  if (!existsSync(distDir)) {
    return { ok: false, documents: 0, checked: 0, problems: [`${distDir} does not exist.`] };
  }

  const files = collectHtmlFiles(distDir);
  if (files.length === 0) {
    return {
      ok: false,
      documents: 0,
      checked: 0,
      problems: [`no HTML documents under ${distDir}; the Twitter card gate would vacuously pass.`],
    };
  }

  const seen = new Set();
  let checked = 0;

  for (const file of files) {
    const relFile = relative(distDir, file);
    const html = readFileSync(file, "utf8");
    const { images, cards } = extractTwitterCardMeta(html);

    if (images.length === 0) {
      problems.push(
        cards.length > 0
          ? `${relFile}: declares twitter:card="${cards[0]}" but no twitter:image; X renders a text-only card.`
          : `${relFile}: no twitter:image declared.`,
      );
      continue;
    }
    if (images.length > 1) {
      problems.push(`${relFile}: ${images.length} twitter:image tags; expected exactly one.`);
    }

    for (const url of images) {
      if (seen.has(url)) continue;
      seen.add(url);
      const imageProblems = validateTwitterCardImage({ distDir, url });
      if (imageProblems.length > 0) {
        problems.push(...imageProblems.map((problem) => `${relFile}: ${problem}`));
        continue;
      }
      checked += 1;
    }
  }

  return { ok: problems.length === 0, documents: files.length, checked, problems };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  const { ok, documents, checked, problems } = validateTwitterCardImages(distDir);

  if (!ok) {
    console.error(
      `assert-twitter-card-images: FAIL — ${problems.length} problem(s) across ${documents} document(s):\n  - ` +
        problems.join("\n  - "),
    );
    process.exit(1);
  }

  console.log(
    `assert-twitter-card-images: OK — ${checked} unique Twitter card image(s) across ${documents} ` +
      `document(s) at ${EXPECTED_TWITTER_CARD_WIDTH}x${EXPECTED_TWITTER_CARD_HEIGHT}, PNG 8-bit truecolour, non-interlaced.`,
  );
}

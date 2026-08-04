#!/usr/bin/env node
/**
 * assert-ssr-head-snapshots-present
 *
 * Precondition gate for the SEO head-fidelity validators.
 *
 * `scripts/capture-ssr-head-snapshots-with-server.mjs` renders every document
 * listed in dist/seo-manifest.json through the built server bundle and writes
 * the SSR HTML to dist/<fileName>. This gate proves, before any validator
 * runs, that each of those pre-rendered head snapshots is:
 *
 *   1. present at the exact path the manifest declares,
 *   2. a real file with meaningful bytes (not a 0-byte or truncated write),
 *   3. in the expected format — an HTML document with a <head>, exactly one
 *      non-empty <title>, a non-empty meta description, and exactly one
 *      <link rel="canonical"> whose href matches the manifest canonical.
 *
 * Without it, a partially-written dist surfaces as a confusing
 * "expected pre-rendered file" list from the last validator in the chain,
 * or (worse) as a vacuous pass when the manifest itself is short.
 *
 * This script never generates or repairs artifacts — it only reports.
 *
 * Usage: node scripts/assert-ssr-head-snapshots-present.mjs [distDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ALLOWED_OG_COLOR_TYPES,
  EXPECTED_OG_BIT_DEPTH,
  EXPECTED_OG_HEIGHT,
  EXPECTED_OG_WIDTH,
  PNG_COLOR_TYPE_LABELS,
  ogSlugForPath,
  readPngHeader,
} from "./assert-og-card-dimensions.mjs";

/** A real SSR head snapshot is far larger; this only catches empty/truncated writes. */
const MINIMUM_SNAPSHOT_BYTES = 200;

function fail(message) {
  console.error(`assert-ssr-head-snapshots-present: FAIL — ${message}`);
  process.exit(1);
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * Expected OG card filename for a manifest document.
 * Prefers the manifest canonical URL, falling back to the document path.
 * @returns {string | null} `<slug>.png`, or null when no path can be resolved.
 */
export function expectedOgCardFileNameForDocument(document) {
  const canonical = document?.metadata?.url;
  let pathname = null;
  if (typeof canonical === "string" && canonical.trim() !== "") {
    try {
      pathname = new URL(canonical).pathname;
    } catch {
      pathname = null;
    }
  }
  if (pathname === null && typeof document?.path === "string" && document.path.startsWith("/")) {
    pathname = document.path;
  }
  if (pathname === null) return null;
  return `${ogSlugForPath(pathname)}.png`;
}

/**
 * Basename of an og:image URL when it points at a generated card, else null.
 * Documents are allowed to reference the brand logo instead of a card.
 */
export function ogCardBaseNameFromImageUrl(image) {
  if (typeof image !== "string" || image.trim() === "") return null;
  let pathname;
  try {
    pathname = new URL(image, "https://verdantgrowdiary.com").pathname;
  } catch {
    return null;
  }
  if (!pathname.includes("/og/")) return null;
  return pathname.slice(pathname.lastIndexOf("/") + 1);
}

/**
 * Assert a generated card exists at dist/client/og/<fileName> (exact case) and
 * decodes as a card of the expected resolution and pixel format.
 * @returns {string[]} problem descriptions (empty when the card is sound)
 */
export function inspectOgCardFile(distDir, fileName, ogListing) {
  const problems = [];
  if (ogListing === null) {
    return [`dist/client/og is missing; og:image references ${fileName} but no cards were emitted.`];
  }
  if (!ogListing.has(fileName)) {
    return [
      `og:image references /og/${fileName}, but that file is not present in dist/client/og ` +
        `(filenames are case-sensitive on the production host).`,
    ];
  }

  const filePath = join(distDir, "client/og", fileName);
  const header = readPngHeader(readFileSync(filePath));
  if (!header.ok) {
    return [`og:image card /og/${fileName} is not a readable PNG: ${header.reason}.`];
  }
  if (header.width !== EXPECTED_OG_WIDTH || header.height !== EXPECTED_OG_HEIGHT) {
    problems.push(
      `og:image card /og/${fileName} is ${header.width}x${header.height}; ` +
        `expected ${EXPECTED_OG_WIDTH}x${EXPECTED_OG_HEIGHT}.`,
    );
  }
  if (header.bitDepth !== EXPECTED_OG_BIT_DEPTH) {
    problems.push(
      `og:image card /og/${fileName} has bit depth ${header.bitDepth}; ` +
        `expected ${EXPECTED_OG_BIT_DEPTH}.`,
    );
  }
  if (!ALLOWED_OG_COLOR_TYPES.includes(header.colorType)) {
    const label = PNG_COLOR_TYPE_LABELS[header.colorType] ?? "unknown";
    problems.push(
      `og:image card /og/${fileName} has colour type ${header.colorType} (${label}); ` +
        `expected one of ${ALLOWED_OG_COLOR_TYPES.join(", ")}.`,
    );
  }
  return problems;
}

/** Real, case-sensitive listing of dist/client/og, or null when absent. */
function readOgListing(distDir) {
  const ogDir = join(distDir, "client/og");
  if (!existsSync(ogDir) || !statSync(ogDir).isDirectory()) return null;
  return new Set(readdirSync(ogDir).filter((entry) => statSync(join(ogDir, entry)).isFile()));
}

/**
 * Validate every manifest document's pre-rendered head snapshot inside `distDir`.
 * Exported so tests can exercise it without spawning a process.
 */
export function validateHeadSnapshots(distDir) {
  const problems = [];
  const manifestPath = join(distDir, "seo-manifest.json");

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      checked: 0,
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
      problems: [`${manifestPath} lists no documents; there is nothing to verify.`],
    };
  }

  let checked = 0;
  const ogListing = readOgListing(distDir);

  for (const document of documents) {
    const label = typeof document?.path === "string" ? document.path : "(unnamed route)";
    const fileName = document?.fileName;

    if (typeof fileName !== "string" || fileName.trim() === "") {
      problems.push(`${label}: manifest entry declares no output fileName.`);
      continue;
    }

    const filePath = join(distDir, fileName);

    if (!existsSync(filePath)) {
      problems.push(`${label}: head snapshot missing at ${filePath}.`);
      continue;
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      problems.push(`${label}: ${filePath} exists but is not a file.`);
      continue;
    }
    if (stats.size === 0) {
      problems.push(`${label}: head snapshot at ${filePath} is empty (0 bytes).`);
      continue;
    }
    if (stats.size < MINIMUM_SNAPSHOT_BYTES) {
      problems.push(
        `${label}: head snapshot at ${filePath} is only ${stats.size} byte(s); ` +
          `expected at least ${MINIMUM_SNAPSHOT_BYTES} — the render was truncated.`,
      );
      continue;
    }

    checked += 1;
    const html = readFileSync(filePath, "utf8");

    if (!/<html[\s>]/i.test(html)) {
      problems.push(`${label}: head snapshot is not an HTML document (no <html> element).`);
      continue;
    }
    if (!/<head[\s>]/i.test(html)) {
      problems.push(`${label}: head snapshot has no <head> element.`);
      continue;
    }

    const titles = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)];
    if (titles.length === 0) {
      problems.push(`${label}: head snapshot has no <title>.`);
    } else if (titles.length > 1) {
      problems.push(`${label}: head snapshot has ${titles.length} <title> elements; expected 1.`);
    } else if (titles[0][1].trim() === "") {
      problems.push(`${label}: head snapshot <title> is empty.`);
    }

    const description = html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i,
    );
    if (!description) {
      problems.push(`${label}: head snapshot has no meta description.`);
    } else if (description[1].trim() === "") {
      problems.push(`${label}: head snapshot meta description is empty.`);
    }

    const canonicals = [
      ...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/gi),
    ];
    const expectedCanonical = document?.metadata?.url;
    if (canonicals.length === 0) {
      problems.push(`${label}: head snapshot has no <link rel="canonical">.`);
    } else if (canonicals.length > 1) {
      problems.push(
        `${label}: head snapshot has ${canonicals.length} canonical links; expected exactly 1.`,
      );
    } else if (typeof expectedCanonical === "string" && expectedCanonical.trim() !== "") {
      const actual = decodeHtmlEntities(canonicals[0][1]).trim();
      if (actual !== expectedCanonical) {
        problems.push(
          `${label}: head snapshot canonical ${JSON.stringify(actual)} does not match ` +
            `manifest canonical ${JSON.stringify(expectedCanonical)}.`,
        );
      }
    }

    const ogImages = [
      ...html.matchAll(
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/gi,
      ),
    ];
    if (ogImages.length === 0) {
      problems.push(`${label}: head snapshot has no <meta property="og:image">.`);
    } else if (ogImages.length > 1) {
      problems.push(
        `${label}: head snapshot has ${ogImages.length} og:image tags; expected exactly 1.`,
      );
    } else {
      const ogImage = decodeHtmlEntities(ogImages[0][1]).trim();
      if (ogImage === "") {
        problems.push(`${label}: head snapshot og:image is empty.`);
      } else if (!/^https?:\/\//i.test(ogImage)) {
        problems.push(
          `${label}: og:image ${JSON.stringify(ogImage)} is not an absolute URL; ` +
            `social scrapers cannot resolve relative image paths.`,
        );
      } else {
        const referenced = ogCardBaseNameFromImageUrl(ogImage);
        if (referenced !== null) {
          const expectedCard = expectedOgCardFileNameForDocument(document);
          if (expectedCard !== null && referenced !== expectedCard) {
            problems.push(
              `${label}: og:image points at /og/${referenced}, but this route's generated ` +
                `card is /og/${expectedCard}.`,
            );
          }
          for (const problem of inspectOgCardFile(distDir, referenced, ogListing)) {
            problems.push(`${label}: ${problem}`);
          }
        }
      }
    }
  }

  return { ok: problems.length === 0, checked, problems, total: documents.length };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");

  if (!existsSync(distDir)) {
    fail(`build output directory missing at ${distDir}. Run \`bun run build\` first.`);
  }

  const { ok, checked, problems, total } = validateHeadSnapshots(distDir);

  if (!ok) {
    fail(
      `${problems.length} head snapshot problem(s) in ${distDir}:\n  - ` + problems.join("\n  - "),
    );
  }

  console.log(
    `assert-ssr-head-snapshots-present: OK — ${checked}/${total} pre-rendered head snapshot(s) ` +
      `present, non-empty, and well-formed (single title, meta description, matching canonical, ` +
      `og:image resolving to a ${EXPECTED_OG_WIDTH}x${EXPECTED_OG_HEIGHT} card).`,
  );
}

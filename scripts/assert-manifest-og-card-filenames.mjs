#!/usr/bin/env node
/**
 * assert-manifest-og-card-filenames
 *
 * Precondition gate: every OG card referenced by dist/seo-manifest.json must
 * exist under dist/client/og with the EXACT expected filename.
 *
 * `assert-og-card-dimensions.mjs` already checks that a card resolves to a real
 * 1200x630 PNG, but it resolves cards through `existsSync`, which is
 * case-insensitive on macOS/Windows checkouts. A card emitted as
 * `Guides--Bud-Rot.png` and referenced as `guides--bud-rot.png` passes locally
 * and 404s on the Linux host that actually serves it. This gate compares
 * against the real directory listing, so filename case and separators must
 * match byte-for-byte.
 *
 * Assertions per manifest document:
 *   1. the canonical URL resolves to an OG slug,
 *   2. `<slug>.png` is present in the real dist/client/og listing (exact case),
 *   3. when metadata.image points at /og/, its basename equals `<slug>.png`.
 *
 * Plus: the homepage card `home.png` must exist (it is emitted separately from
 * the document list, so no document references it).
 *
 * This script never generates or repairs artifacts — it only reports.
 *
 * Usage: node scripts/assert-manifest-og-card-filenames.mjs [distDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { ogSlugForPath } from "./assert-og-card-dimensions.mjs";

/** Emitted by generate-seo-artifacts.ts outside the document loop. */
export const REQUIRED_STANDALONE_CARDS = ["home.png"];

function fail(message) {
  console.error(`assert-manifest-og-card-filenames: FAIL — ${message}`);
  process.exit(1);
}

/**
 * Real, case-sensitive listing of the OG card directory.
 * @param {string} distDir
 * @returns {{ ok: true, files: Set<string> } | { ok: false, reason: string }}
 */
export function readOgCardDirectory(distDir) {
  const ogDir = join(distDir, "client/og");
  if (!existsSync(ogDir) || !statSync(ogDir).isDirectory()) {
    return { ok: false, reason: `${ogDir} missing; the OG cards were never emitted.` };
  }
  const files = new Set(
    readdirSync(ogDir).filter((entry) => statSync(join(ogDir, entry)).isFile()),
  );
  return { ok: true, files };
}

/**
 * Expected card filename for a manifest document's canonical URL.
 * @param {unknown} canonicalUrl
 * @returns {{ ok: true, fileName: string } | { ok: false, reason: string }}
 */
export function expectedCardFileName(canonicalUrl) {
  let pathname;
  try {
    pathname = new URL(String(canonicalUrl)).pathname;
  } catch {
    return {
      ok: false,
      reason: `canonical URL ${JSON.stringify(canonicalUrl)} is not absolute; cannot resolve its OG card filename`,
    };
  }
  return { ok: true, fileName: `${ogSlugForPath(pathname)}.png` };
}

/**
 * If `image` is an OG card URL, return its basename; otherwise null (documents
 * are allowed to reference the brand logo instead of a generated card).
 * @param {unknown} image
 * @returns {string | null}
 */
export function referencedOgCardFileName(image) {
  if (typeof image !== "string" || image.length === 0) return null;
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
 * Validate every manifest-referenced OG card filename inside `distDir`.
 * Exported so tests can exercise it without spawning a process.
 * @param {string} distDir
 */
export function validateManifestOgCardFileNames(distDir) {
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
      problems: [`${manifestPath} lists no documents; this gate would vacuously pass.`],
    };
  }

  const listing = readOgCardDirectory(distDir);
  if (!listing.ok) {
    return { ok: false, checked: 0, total: documents.length, problems: [listing.reason] };
  }
  const present = listing.files;
  const lowerIndex = new Map();
  for (const file of present) lowerIndex.set(file.toLowerCase(), file);

  const expected = new Set();
  let checked = 0;

  for (const document of documents) {
    const route = document?.path ?? document?.metadata?.url ?? "(unknown route)";
    const resolved = expectedCardFileName(document?.metadata?.url);
    if (!resolved.ok) {
      problems.push(`${route}: ${resolved.reason}.`);
      continue;
    }
    const fileName = resolved.fileName;
    expected.add(fileName);

    if (!present.has(fileName)) {
      const nearMiss = lowerIndex.get(fileName.toLowerCase());
      problems.push(
        nearMiss
          ? `${route}: expected OG card "og/${fileName}" but dist/client/og contains "og/${nearMiss}" ` +
            `— filename case must match exactly or the served URL 404s on Linux hosts.`
          : `${route}: expected OG card "og/${fileName}" is not present in dist/client/og.`,
      );
      continue;
    }

    const referenced = referencedOgCardFileName(document?.metadata?.image);
    if (referenced !== null && referenced !== fileName) {
      problems.push(
        `${route}: metadata.image references "og/${referenced}" but the card emitted for this ` +
          `canonical path is "og/${fileName}".`,
      );
      continue;
    }

    checked += 1;
  }

  for (const fileName of REQUIRED_STANDALONE_CARDS) {
    expected.add(fileName);
    if (!present.has(fileName)) {
      problems.push(`standalone OG card "og/${fileName}" is not present in dist/client/og.`);
    }
  }

  return { ok: problems.length === 0, checked, total: expected.size, problems };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");

  if (!existsSync(distDir)) {
    fail(`build output directory missing at ${distDir}. Run \`bun run build\` first.`);
  }

  const { ok, checked, total, problems } = validateManifestOgCardFileNames(distDir);

  if (!ok) {
    fail(
      `${problems.length} OG card filename problem(s) in ${distDir}:\n  - ` + problems.join("\n  - "),
    );
  }

  console.log(
    `assert-manifest-og-card-filenames: OK — ${checked} manifest document(s) resolved to ` +
      `${total} exact OG card filename(s) under dist/client/og.`,
  );
}

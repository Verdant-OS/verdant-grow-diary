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
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

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
      `present, non-empty, and well-formed (single title, meta description, matching canonical).`,
  );
}

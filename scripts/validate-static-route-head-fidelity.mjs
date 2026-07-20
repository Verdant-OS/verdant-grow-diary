#!/usr/bin/env node
/**
 * validate-static-route-head-fidelity
 *
 * Postbuild regression check: every pre-rendered public route in
 * `dist/seo-manifest.json` (emitted by the staticSocialRouteDocuments
 * vite plugin) must expose head metadata that EXACTLY matches the
 * manifest — the same title, description, canonical, og:url,
 * og:title, og:description, og:image, og:image:alt, twitter:card,
 * twitter:title, twitter:description, and twitter:image that
 * JS-executing crawlers would see, so non-JS crawlers (LinkedIn,
 * Slack, Facebook, Twitter card fetcher, etc.) get the same
 * per-route <head> without any hosting rewrite.
 *
 * Fails hard on any drift — silent mis-emission of a route's <head>
 * would look fine locally and rot in production.
 *
 * Pure module + thin CLI so tests can drive it directly.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const CANONICAL_REGEX =
  /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
const HREF_REGEX = /href=["']([^"']*)["']/i;
const CONTENT_REGEX = /content=["']([^"']*)["']/i;
const NAME_REGEX = /name=["']([^"']+)["']/i;
const PROPERTY_REGEX = /property=["']([^"']+)["']/i;

function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Extract head values from a document as a lookup map plus title/canonical.
 * @param {string} html
 */
export function extractHead(html) {
  const metas = new Map();
  for (const tag of html.match(META_TAG_REGEX) ?? []) {
    const nameMatch = tag.match(NAME_REGEX);
    const propMatch = tag.match(PROPERTY_REGEX);
    const contentMatch = tag.match(CONTENT_REGEX);
    if (!contentMatch) continue;
    const key = nameMatch
      ? `name:${nameMatch[1].toLowerCase()}`
      : propMatch
        ? `property:${propMatch[1].toLowerCase()}`
        : null;
    if (!key) continue;
    // Last one wins to mirror crawler behavior on duplicates.
    metas.set(key, decode(contentMatch[1]));
  }
  const titleMatch = html.match(TITLE_REGEX);
  const canonicalTag = html.match(CANONICAL_REGEX);
  const canonical = canonicalTag ? canonicalTag[0].match(HREF_REGEX)?.[1] ?? null : null;
  return {
    title: titleMatch ? decode(titleMatch[1].trim()) : null,
    canonical: canonical ? decode(canonical) : null,
    metas,
  };
}

/**
 * Compare an extracted head against the manifest metadata for one route.
 * Returns a list of human-readable failure strings; empty means clean.
 *
 * @param {ReturnType<typeof extractHead>} head
 * @param {{ path: string; metadata: { title: string; description: string; url: string; image: string; imageAlt: string; robots?: string } }} entry
 */
export function checkRouteHead(head, entry) {
  const { path, metadata } = entry;
  const issues = [];
  const expect = (label, actual, expected) => {
    if (actual !== expected) {
      issues.push(
        `${path}: ${label} mismatch\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
      );
    }
  };
  expect("<title>", head.title, metadata.title);
  expect("<link rel=canonical>", head.canonical, metadata.url);
  expect(
    'meta name="description"',
    head.metas.get("name:description") ?? null,
    metadata.description,
  );
  expect(
    'meta property="og:title"',
    head.metas.get("property:og:title") ?? null,
    metadata.title,
  );
  expect(
    'meta property="og:description"',
    head.metas.get("property:og:description") ?? null,
    metadata.description,
  );
  expect(
    'meta property="og:url"',
    head.metas.get("property:og:url") ?? null,
    metadata.url,
  );
  expect(
    'meta property="og:image"',
    head.metas.get("property:og:image") ?? null,
    metadata.image,
  );
  expect(
    'meta property="og:image:alt"',
    head.metas.get("property:og:image:alt") ?? null,
    metadata.imageAlt,
  );
  expect(
    'meta name="twitter:card"',
    head.metas.get("name:twitter:card") ?? null,
    "summary_large_image",
  );
  expect(
    'meta name="twitter:title"',
    head.metas.get("name:twitter:title") ?? null,
    metadata.title,
  );
  expect(
    'meta name="twitter:description"',
    head.metas.get("name:twitter:description") ?? null,
    metadata.description,
  );
  expect(
    'meta name="twitter:image"',
    head.metas.get("name:twitter:image") ?? null,
    metadata.image,
  );
  if (metadata.robots) {
    expect(
      'meta name="robots"',
      head.metas.get("name:robots") ?? null,
      metadata.robots,
    );
  }
  return issues;
}

/**
 * Validate every entry in the manifest against dist/<fileName>.
 * @param {string} distDir
 */
export function validateDist(distDir) {
  const manifestPath = join(distDir, "seo-manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      issues: [
        `seo-manifest.json missing at ${manifestPath}. The staticSocialRouteDocuments vite plugin must run before this validator.`,
      ],
    };
  }
  /** @type {{ documents: Array<{ path: string; fileName: string; metadata: any }> }} */
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const issues = [];
  for (const entry of manifest.documents) {
    const filePath = join(distDir, entry.fileName);
    if (!existsSync(filePath)) {
      issues.push(`${entry.path}: expected pre-rendered file ${entry.fileName} not found in dist/`);
      continue;
    }
    const head = extractHead(readFileSync(filePath, "utf8"));
    issues.push(...checkRouteHead(head, entry));
  }
  return { ok: issues.length === 0, issues };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = resolve(process.cwd(), process.argv[2] ?? "dist");
  const { ok, issues } = validateDist(distDir);
  if (!ok) {
    console.error(
      `validate-static-route-head-fidelity: ${issues.length} head-fidelity failure(s) in ${distDir}`,
    );
    for (const issue of issues) console.error("  - " + issue);
    process.exit(1);
  }
  console.log(`validate-static-route-head-fidelity: OK (${distDir})`);
}

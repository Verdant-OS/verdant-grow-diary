#!/usr/bin/env node
/**
 * check-sitemap-canonical-parity
 *
 * Asserts that public/sitemap.xml, public/robots.txt, and the canonical
 * <link rel="canonical"> tags emitted into every static document in
 * `dist/` describe the SAME set of absolute URLs on the SAME canonical
 * origin. Any drift between the three sources causes crawlers to
 * attribute pages to the wrong URL (or discover URLs that no page
 * actually claims), so we fail the build.
 *
 * Rules enforced:
 *   1. Every <loc> in public/sitemap.xml is an absolute https URL on
 *      CANONICAL_ORIGIN with no query/fragment.
 *   2. Every <loc> in public/sitemap.xml has a matching static document
 *      in dist/ whose <link rel="canonical"> href is exactly that URL.
 *   3. Every static dist/*.html document (except the SPA fallback
 *      dist/index.html) whose canonical points at CANONICAL_ORIGIN
 *      appears in public/sitemap.xml as a <loc>.
 *   4. Every `Sitemap:` directive in public/robots.txt is an absolute
 *      https URL on CANONICAL_ORIGIN, and at least one of them resolves
 *      to /sitemap.xml (the file we ship at public/sitemap.xml).
 *
 * Pure module + thin CLI so tests can drive it directly.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_ORIGIN,
  collectHtmlFiles,
  expectedPathForFile,
  extractCanonicalLinks,
} from "./validate-canonical-links.mjs";

/** @typedef {{ message: string; detail?: string }} Issue */

/**
 * Extract every <loc>…</loc> value from a sitemap XML string, in order.
 * @param {string} xml
 * @returns {string[]}
 */
export function extractSitemapLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * Extract every `Sitemap: <url>` directive from a robots.txt string.
 * Case-insensitive on the field name per the robots.txt spec.
 * @param {string} text
 * @returns {string[]}
 */
export function extractRobotsSitemapUrls(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim().toLowerCase() !== "sitemap") continue;
    const value = line.slice(idx + 1).trim();
    if (value) out.push(value);
  }
  return out;
}

/**
 * Build the map { canonicalUrl -> dist/rel/path.html } for every static
 * document under `distDir`. The SPA fallback (`index.html`) is skipped
 * because it intentionally ships without a hardcoded canonical.
 * @param {string} distDir
 * @returns {{ canonicals: Map<string, string>; malformed: Issue[] }}
 */
export function collectDocumentCanonicals(distDir) {
  const canonicals = new Map();
  const malformed = [];
  for (const file of collectHtmlFiles(distDir)) {
    const rel = file
      .slice(distDir.length + 1)
      .replace(/\\/g, "/");
    if (rel === "index.html") continue;
    const html = readFileSync(file, "utf8");
    const links = extractCanonicalLinks(html);
    if (links.length !== 1 || !links[0].href) {
      // validate-canonical-links.mjs already reports these; skip here.
      continue;
    }
    const href = links[0].href;
    const expectedUrl = `${CANONICAL_ORIGIN}${expectedPathForFile(rel)}`;
    if (href !== expectedUrl) {
      // Same — the sibling validator catches href/path mismatches. We
      // still want to key the parity map by the CANONICAL that was
      // actually emitted so a mismatch shows up as a sitemap gap here
      // too (defense in depth).
    }
    if (canonicals.has(href)) {
      malformed.push({
        message: `duplicate canonical URL emitted by multiple documents`,
        detail: `${href} — ${canonicals.get(href)} and ${rel}`,
      });
    } else {
      canonicals.set(href, rel);
    }
  }
  return { canonicals, malformed };
}

/**
 * Validate that a URL string is absolute https on CANONICAL_ORIGIN with
 * no query/fragment. Returns an issue message or null.
 * @param {string} url
 * @param {string} label
 * @returns {string | null}
 */
export function validateAbsoluteCanonicalUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `${label} is not an absolute URL: ${url}`;
  }
  if (parsed.protocol !== "https:") {
    return `${label} must be https, got ${parsed.protocol} — ${url}`;
  }
  if (`${parsed.protocol}//${parsed.host}` !== CANONICAL_ORIGIN) {
    return `${label} must live on ${CANONICAL_ORIGIN}, got ${parsed.protocol}//${parsed.host} — ${url}`;
  }
  if (parsed.search || parsed.hash) {
    return `${label} must have no query/fragment — ${url}`;
  }
  return null;
}

/**
 * Run every parity check.
 * @param {{ distDir: string; sitemapXml: string; robotsTxt: string }} args
 * @returns {{ issues: Issue[]; sitemapCount: number; canonicalCount: number; robotsSitemapCount: number }}
 */
export function checkSitemapCanonicalParity({ distDir, sitemapXml, robotsTxt }) {
  const issues = [];
  const push = (message, detail) => issues.push({ message, detail });

  const sitemapUrls = extractSitemapLocs(sitemapXml);
  const sitemapSet = new Set();
  for (const url of sitemapUrls) {
    const err = validateAbsoluteCanonicalUrl(url, "sitemap <loc>");
    if (err) push(err);
    else sitemapSet.add(url);
  }

  const { canonicals, malformed } = collectDocumentCanonicals(distDir);
  for (const m of malformed) push(m.message, m.detail);

  // Rule 2: every sitemap URL must be claimed by exactly one static doc.
  for (const url of sitemapSet) {
    if (!canonicals.has(url)) {
      push(
        `sitemap URL has no matching <link rel="canonical"> in dist/`,
        url,
      );
    }
  }

  // Rule 3: every canonical on CANONICAL_ORIGIN must appear in sitemap.
  for (const [url, file] of canonicals) {
    if (!url.startsWith(`${CANONICAL_ORIGIN}/`)) continue;
    if (!sitemapSet.has(url)) {
      push(
        `document canonical is not listed in public/sitemap.xml`,
        `${url} (from ${file})`,
      );
    }
  }

  // Rule 4: robots.txt Sitemap: directives.
  const robotsSitemapUrls = extractRobotsSitemapUrls(robotsTxt);
  if (robotsSitemapUrls.length === 0) {
    push(`public/robots.txt has no Sitemap: directive`);
  }
  for (const url of robotsSitemapUrls) {
    const err = validateAbsoluteCanonicalUrl(url, "robots.txt Sitemap:");
    if (err) push(err);
  }
  const expectedSitemapUrl = `${CANONICAL_ORIGIN}/sitemap.xml`;
  if (
    robotsSitemapUrls.length > 0 &&
    !robotsSitemapUrls.includes(expectedSitemapUrl)
  ) {
    push(
      `no robots.txt Sitemap: directive resolves to ${expectedSitemapUrl}`,
      robotsSitemapUrls.join(", "),
    );
  }

  return {
    issues,
    sitemapCount: sitemapSet.size,
    canonicalCount: canonicals.size,
    robotsSitemapCount: robotsSitemapUrls.length,
  };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  const sitemapPath = resolve("public/sitemap.xml");
  const robotsPath = resolve("public/robots.txt");
  if (!existsSync(distDir)) {
    console.error(
      `[check-sitemap-canonical-parity] dist directory not found: ${distDir}`,
    );
    process.exit(1);
  }
  if (!existsSync(sitemapPath)) {
    console.error(
      `[check-sitemap-canonical-parity] missing public/sitemap.xml`,
    );
    process.exit(1);
  }
  if (!existsSync(robotsPath)) {
    console.error(
      `[check-sitemap-canonical-parity] missing public/robots.txt`,
    );
    process.exit(1);
  }
  const result = checkSitemapCanonicalParity({
    distDir,
    sitemapXml: readFileSync(sitemapPath, "utf8"),
    robotsTxt: readFileSync(robotsPath, "utf8"),
  });
  if (result.issues.length > 0) {
    console.error(
      `[check-sitemap-canonical-parity] FAIL — ${result.issues.length} issue(s) ` +
        `(sitemap=${result.sitemapCount}, canonicals=${result.canonicalCount}, ` +
        `robots Sitemap=${result.robotsSitemapCount}):`,
    );
    for (const i of result.issues) {
      console.error(`  → ${i.message}`);
      if (i.detail) console.error(`      ${i.detail}`);
    }
    process.exit(1);
  }
  console.log(
    `[check-sitemap-canonical-parity] OK — sitemap=${result.sitemapCount}, ` +
      `canonicals=${result.canonicalCount}, robots Sitemap=${result.robotsSitemapCount}`,
  );
}

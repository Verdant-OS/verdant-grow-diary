#!/usr/bin/env node
/**
 * validate-og-url-canonical-parity
 *
 * Walks a built `dist/` directory and for every emitted .html file
 * asserts that:
 *
 *   - the document declares exactly one `<link rel="canonical">` with
 *     an absolute href (we defer full canonical-shape checks to
 *     validate-canonical-links; here we only need the href to compare)
 *   - every `<meta property="og:url">` value equals the canonical href
 *     exactly (case-sensitive, byte-identical)
 *   - every `<meta name="twitter:url">` value, when present, also
 *     equals the canonical href exactly
 *
 * Rationale: crawlers attribute a page's title, description, and image
 * to whatever URL `og:url` / `twitter:url` claim the page lives at. If
 * those disagree with the canonical tag, per-route social cards are
 * silently reattributed to another URL (usually the homepage), and the
 * per-route og:* tags are effectively ignored.
 *
 * Pure module + thin CLI so tests can drive it directly. Errors fail
 * the postbuild.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string; tag: string; message: string }} Issue */

/**
 * Recursively collect every *.html file under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectHtmlFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && full.toLowerCase().endsWith(".html")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const CANONICAL_LINK_REGEX =
  /<link\s+[^>]*rel=["']canonical["'][^>]*>/gi;
const HREF_ATTR_REGEX = /href=["']([^"']+)["']/i;

/**
 * Extract every canonical href declared in a document. A well-formed
 * document has exactly one; we return all so callers can flag
 * duplicates.
 * @param {string} html
 * @returns {string[]}
 */
export function extractCanonicalHrefs(html) {
  const out = [];
  for (const match of html.matchAll(CANONICAL_LINK_REGEX)) {
    const href = match[0].match(HREF_ATTR_REGEX);
    if (href) out.push(href[1]);
  }
  return out;
}

const URL_META_REGEX =
  /<meta\s+(?:name|property)=["'](og:url|twitter:url)["']\s+content=["']([^"']+)["'][^>]*\/?>/gi;
const URL_META_REGEX_REVERSED =
  /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](og:url|twitter:url)["'][^>]*\/?>/gi;

/**
 * Extract all og:url and twitter:url content values from a document.
 * Handles both attribute orderings (property-first and content-first)
 * that html serializers emit.
 * @param {string} html
 * @returns {{ tag: "og:url" | "twitter:url"; url: string }[]}
 */
export function extractUrlMetaTags(html) {
  const out = [];
  for (const match of html.matchAll(URL_META_REGEX)) {
    out.push({ tag: /** @type {"og:url"|"twitter:url"} */ (match[1].toLowerCase()), url: match[2] });
  }
  for (const match of html.matchAll(URL_META_REGEX_REVERSED)) {
    out.push({ tag: /** @type {"og:url"|"twitter:url"} */ (match[2].toLowerCase()), url: match[1] });
  }
  return out;
}

/**
 * Validate one HTML document's og:url / twitter:url ↔ canonical parity.
 * @param {{ file: string; html: string; distDir?: string }} args
 * @returns {Issue[]}
 */
export function validateDocument({ file, html, distDir }) {
  const issues = [];
  const relFile = distDir ? relative(distDir, file) : file;
  const push = (tag, message) => issues.push({ file: relFile, tag, message });

  const canonicals = extractCanonicalHrefs(html);
  const urlTags = extractUrlMetaTags(html);

  if (canonicals.length === 0) {
    // No canonical means there is nothing to compare against. og:url
    // and twitter:url still need *some* reference; without a canonical
    // we cannot enforce parity, so we report and stop.
    if (urlTags.length > 0) {
      push(
        "canonical",
        `document declares ${urlTags.length} og:url/twitter:url tag(s) but no <link rel="canonical"> to compare against`,
      );
    }
    return issues;
  }
  if (canonicals.length > 1) {
    push(
      "canonical",
      `document declares ${canonicals.length} <link rel="canonical"> tags; parity check requires exactly one`,
    );
    return issues;
  }

  const canonical = canonicals[0];
  for (const { tag, url } of urlTags) {
    if (url !== canonical) {
      push(
        tag,
        `${tag} content "${url}" does not match canonical href "${canonical}" (must be byte-identical)`,
      );
    }
  }
  return issues;
}

/**
 * Validate every HTML document under `distDir`.
 * @param {string} distDir
 * @returns {{ issues: Issue[]; documents: number; comparisons: number }}
 */
export function validateOgUrlCanonicalParity(distDir) {
  const files = collectHtmlFiles(distDir);
  const issues = [];
  let comparisons = 0;
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    comparisons += extractUrlMetaTags(html).length;
    issues.push(...validateDocument({ file, html, distDir }));
  }
  return { issues, documents: files.length, comparisons };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-og-url-canonical-parity] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents, comparisons } = validateOgUrlCanonicalParity(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-og-url-canonical-parity] FAIL — ${issues.length} issue(s) across ${documents} document(s), ${comparisons} og:url/twitter:url tag(s) checked:`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}  [${issue.tag}]\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-og-url-canonical-parity] OK — ${comparisons} og:url/twitter:url tag(s) across ${documents} document(s) match their canonical href`,
  );
}

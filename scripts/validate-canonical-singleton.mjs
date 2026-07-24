#!/usr/bin/env node
/**
 * validate-canonical-singleton
 *
 * Walks a built `dist/` directory and asserts that every emitted .html
 * file (except the SPA fallback `dist/index.html`, whose canonical is
 * set at runtime by usePageSeo) declares:
 *
 *   - exactly one <link rel="canonical"> element, and
 *   - exactly one corresponding non-empty href attribute value.
 *
 * Complementary to validate-canonical-shape (which enforces the *value*
 * of the canonical URL): this validator only enforces *cardinality*, so
 * a document can never ship with zero, duplicate, or href-less
 * canonical tags — cases crawlers treat as ambiguous and demote.
 *
 * Pure module + thin CLI so tests can drive it directly. Errors fail
 * the postbuild.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string; message: string }} Issue */

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

const CANONICAL_LINK_REGEX = /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi;
const HREF_ATTR_REGEX = /\bhref=["']([^"']*)["']/i;

/**
 * Extract every canonical <link> tag and its href (or null if absent).
 * @param {string} html
 * @returns {Array<{ tag: string; href: string | null }>}
 */
export function extractCanonicalTags(html) {
  const out = [];
  for (const match of html.matchAll(CANONICAL_LINK_REGEX)) {
    const tag = match[0];
    const href = tag.match(HREF_ATTR_REGEX);
    out.push({ tag, href: href ? href[1] : null });
  }
  return out;
}

/**
 * Validate the canonical cardinality of a single document.
 * @param {{ file: string; html: string; distDir?: string; isSpaFallback?: boolean }} args
 * @returns {Issue[]}
 */
export function validateDocument({ file, html, distDir, isSpaFallback = false }) {
  const issues = [];
  const relFile = distDir ? relative(distDir, file) : file;
  const push = (message) => issues.push({ file: relFile, message });

  const tags = extractCanonicalTags(html);

  if (tags.length === 0) {
    if (isSpaFallback) return issues; // runtime-canonical fallback
    push(`document declares no <link rel="canonical">; exactly one is required`);
    return issues;
  }

  if (tags.length > 1) {
    push(
      `document declares ${tags.length} <link rel="canonical"> tags; exactly one is required`,
    );
    return issues;
  }

  const { href } = tags[0];
  if (href === null) {
    push(`<link rel="canonical"> is missing an href attribute`);
    return issues;
  }
  if (href.trim().length === 0) {
    push(`<link rel="canonical"> has an empty href attribute`);
  }

  return issues;
}

/**
 * Validate every HTML document under `distDir`.
 * @param {string} distDir
 * @returns {{ issues: Issue[]; documents: number; checked: number }}
 */
export function validateCanonicalSingleton(distDir) {
  const files = collectHtmlFiles(distDir);
  const spaFallback = resolve(distDir, "index.html");
  /** @type {Issue[]} */
  const issues = [];
  let checked = 0;
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    const isSpaFallback = resolve(file) === spaFallback;
    const docIssues = validateDocument({ file, html, distDir, isSpaFallback });
    if (docIssues.length === 0 && !isSpaFallback) checked += 1;
    issues.push(...docIssues);
  }
  return { issues, documents: files.length, checked };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-canonical-singleton] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents, checked } = validateCanonicalSingleton(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-canonical-singleton] FAIL — ${issues.length} issue(s) across ${documents} document(s):`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-canonical-singleton] OK — ${checked} document(s) declare exactly one <link rel="canonical"> with exactly one href value (of ${documents} total)`,
  );
}

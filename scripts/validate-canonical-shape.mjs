#!/usr/bin/env node
/**
 * validate-canonical-shape
 *
 * Walks a built `dist/` directory and asserts that every emitted
 * .html file (except the SPA fallback dist/index.html, which sets a
 * per-route canonical at runtime via usePageSeo) declares exactly one
 * <link rel="canonical"> whose href is:
 *
 *   - a syntactically valid absolute URL,
 *   - served over https,
 *   - on the expected canonical origin (https://verdantgrowdiary.com),
 *   - free of duplicated slashes in the path (e.g. "//foo", "/a//b"),
 *   - free of a trailing "#..." fragment,
 *   - free of a trailing "?..." query string (canonicals identify the
 *     document, not a query-scoped view),
 *   - normalized (no trailing "/" except for the root path).
 *
 * Pure module + thin CLI so tests can drive it directly. Errors fail
 * the postbuild.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_ORIGIN = "https://verdantgrowdiary.com";

/** @typedef {{ file: string; href: string | null; message: string }} Issue */

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

const CANONICAL_LINK_REGEX = /<link\s+[^>]*rel=["']canonical["'][^>]*>/gi;
const HREF_ATTR_REGEX = /href=["']([^"']+)["']/i;

/**
 * Extract every canonical href declared in a document.
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

/**
 * Validate one canonical href string.
 * @param {string} href
 * @param {string} expectedOrigin
 * @returns {string[]} messages (empty if OK)
 */
export function validateCanonicalHref(href, expectedOrigin = EXPECTED_ORIGIN) {
  const errors = [];

  // Must be absolute (no relative, no protocol-relative).
  if (!/^https?:\/\//i.test(href)) {
    errors.push(`canonical href "${href}" is not an absolute http(s) URL`);
    return errors;
  }
  if (href.startsWith("//")) {
    errors.push(`canonical href "${href}" is protocol-relative; must be absolute https`);
    return errors;
  }

  let url;
  try {
    url = new URL(href);
  } catch {
    errors.push(`canonical href "${href}" is not a syntactically valid URL`);
    return errors;
  }

  if (url.protocol !== "https:") {
    errors.push(`canonical href "${href}" must use https (got ${url.protocol})`);
  }

  const expected = new URL(expectedOrigin);
  if (url.origin !== expected.origin) {
    errors.push(
      `canonical href "${href}" origin "${url.origin}" does not match expected "${expected.origin}"`,
    );
  }

  if (url.hash) {
    errors.push(`canonical href "${href}" contains a fragment ("${url.hash}"); canonicals must not include #fragments`);
  }
  if (url.search) {
    errors.push(`canonical href "${href}" contains a query string ("${url.search}"); canonicals must identify the document, not a query-scoped view`);
  }

  // Duplicated slashes anywhere in the path (e.g. "//", "/a//b").
  if (/\/{2,}/.test(url.pathname)) {
    errors.push(`canonical href "${href}" pathname "${url.pathname}" contains duplicated slashes`);
  }

  // No trailing slash except for root "/".
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    errors.push(`canonical href "${href}" pathname "${url.pathname}" has a trailing slash; use the non-slash form`);
  }

  // Detect raw duplicated slashes in the original href beyond the "https://"
  // separator (in case the URL parser silently normalized them away).
  const afterOrigin = href.slice(href.indexOf("://") + 3);
  const pathPart = afterOrigin.slice(afterOrigin.indexOf("/"));
  if (afterOrigin.includes("/") && /\/{2,}/.test(pathPart)) {
    errors.push(`canonical href "${href}" contains duplicated slashes in its raw form`);
  }

  return errors;
}

/**
 * Validate every HTML document under `distDir`.
 * @param {string} distDir
 * @param {{ expectedOrigin?: string }} [opts]
 */
export function validateCanonicalShape(distDir, opts = {}) {
  const expectedOrigin = opts.expectedOrigin ?? EXPECTED_ORIGIN;
  const files = collectHtmlFiles(distDir);
  const spaFallback = resolve(distDir, "index.html");
  /** @type {Issue[]} */
  const issues = [];
  let checked = 0;

  for (const file of files) {
    const html = readFileSync(file, "utf8");
    const hrefs = extractCanonicalHrefs(html);
    const relFile = relative(distDir, file);
    const isSpaFallback = resolve(file) === spaFallback;

    if (hrefs.length === 0) {
      if (isSpaFallback) continue; // runtime-canonical fallback
      issues.push({ file: relFile, href: null, message: `document declares no <link rel="canonical">` });
      continue;
    }
    if (hrefs.length > 1) {
      issues.push({
        file: relFile,
        href: null,
        message: `document declares ${hrefs.length} <link rel="canonical"> tags; expected exactly one`,
      });
      continue;
    }

    const href = hrefs[0];
    checked += 1;
    for (const message of validateCanonicalHref(href, expectedOrigin)) {
      issues.push({ file: relFile, href, message });
    }
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
    console.error(`[validate-canonical-shape] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents, checked } = validateCanonicalShape(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-canonical-shape] FAIL — ${issues.length} issue(s) across ${documents} document(s):`,
    );
    for (const issue of issues) {
      const label = issue.href ? ` (${issue.href})` : "";
      console.error(`  ${issue.file}${label}\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-canonical-shape] OK — ${checked} canonical href(s) across ${documents} document(s) are absolute, on ${EXPECTED_ORIGIN}, and normalized`,
  );
}

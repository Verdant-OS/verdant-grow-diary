#!/usr/bin/env node
/**
 * validate-canonical-links
 *
 * Walks a built `dist/` directory and asserts every static public
 * document emits exactly one `<link rel="canonical">` pointing at the
 * expected absolute URL on the canonical Verdant origin.
 *
 * Rules:
 *   - The SPA fallback (`dist/index.html`) intentionally ships without
 *     a hardcoded canonical (usePageSeo emits per-route canonicals at
 *     runtime for unknown/dynamic routes). We assert exactly ZERO
 *     canonical link elements there so a future edit cannot silently
 *     bake in a homepage canonical that would attribute every SPA
 *     route to `/`.
 *   - Every other `*.html` file corresponds to a static public
 *     document. It MUST contain exactly one `<link rel="canonical">`
 *     whose href is `https://verdantgrowdiary.com` + the derived clean
 *     path (e.g. `dist/cultivars/oreoz.html` → `/cultivars/oreoz`).
 *   - The href must be absolute, https, on the canonical origin, and
 *     free of query/fragment (crawlers cache the first canonical they
 *     resolve; a signed or versioned URL poisons the cache).
 *
 * Pure module + thin CLI so tests can drive it directly.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_ORIGIN = "https://verdantgrowdiary.com";

/** @typedef {{ file: string; message: string; found?: string[] }} Issue */

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
  /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi;
const HREF_ATTR_REGEX = /\bhref=["']([^"']+)["']/i;

/**
 * Extract every canonical link element (raw tag + parsed href) from an
 * HTML document. Order-preserving; duplicates are returned as-is so the
 * caller can enforce the "exactly one" rule.
 * @param {string} html
 * @returns {{ tag: string; href: string | null }[]}
 */
export function extractCanonicalLinks(html) {
  const out = [];
  for (const match of html.matchAll(CANONICAL_LINK_REGEX)) {
    const tag = match[0];
    const hrefMatch = tag.match(HREF_ATTR_REGEX);
    out.push({ tag, href: hrefMatch ? hrefMatch[1] : null });
  }
  return out;
}

/**
 * Derive the expected clean pathname from a dist-relative html file
 * path. `index.html` at the dist root maps to `/`; every other file
 * strips the trailing `.html` and prefixes `/`.
 * @param {string} relPath dist-relative path using forward slashes.
 * @returns {string}
 */
export function expectedPathForFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized === "index.html") return "/";
  if (!normalized.toLowerCase().endsWith(".html")) {
    throw new Error(`Not an HTML file: ${relPath}`);
  }
  return `/${normalized.slice(0, -".html".length)}`;
}

/**
 * Validate the canonical link element(s) inside a single HTML file.
 * @param {{ distDir: string; file: string }} args
 * @returns {Issue[]}
 */
export function validateCanonicalInFile({ distDir, file }) {
  const rel = relative(distDir, file).replace(/\\/g, "/");
  const html = readFileSync(file, "utf8");
  const links = extractCanonicalLinks(html);
  const issues = [];
  const push = (message, found) => issues.push({ file: rel, message, found });

  // SPA fallback: exactly zero canonicals.
  if (rel === "index.html") {
    if (links.length !== 0) {
      push(
        `SPA fallback dist/index.html must not ship a hardcoded canonical (found ${links.length})`,
        links.map((l) => l.tag),
      );
    }
    return issues;
  }

  const expectedPath = expectedPathForFile(rel);
  const expectedUrl = `${CANONICAL_ORIGIN}${expectedPath}`;

  if (links.length === 0) {
    push(`missing <link rel="canonical"> (expected ${expectedUrl})`);
    return issues;
  }
  if (links.length > 1) {
    push(
      `expected exactly one <link rel="canonical"> but found ${links.length}`,
      links.map((l) => l.tag),
    );
    return issues;
  }

  const { href } = links[0];
  if (!href) {
    push(`<link rel="canonical"> is missing an href attribute`);
    return issues;
  }

  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    push(`canonical href is not an absolute URL: ${href}`);
    return issues;
  }
  if (parsed.protocol !== "https:") {
    push(`canonical href must be https, got ${parsed.protocol} — ${href}`);
  }
  if (`${parsed.protocol}//${parsed.host}` !== CANONICAL_ORIGIN) {
    push(
      `canonical href must live on ${CANONICAL_ORIGIN}, got ${parsed.protocol}//${parsed.host} — ${href}`,
    );
  }
  if (parsed.search || parsed.hash) {
    push(`canonical href must have no query/fragment — ${href}`);
  }
  if (href !== expectedUrl) {
    push(`canonical href mismatch — expected ${expectedUrl}, got ${href}`);
  }
  return issues;
}

/**
 * Validate every HTML document under `distDir`.
 * @param {string} distDir
 * @returns {{ issues: Issue[]; documents: number; checked: number }}
 */
export function validateCanonicalLinks(distDir) {
  const files = collectHtmlFiles(distDir);
  const issues = [];
  for (const file of files) {
    issues.push(...validateCanonicalInFile({ distDir, file }));
  }
  return { issues, documents: files.length, checked: files.length };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-canonical-links] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents } = validateCanonicalLinks(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-canonical-links] FAIL — ${issues.length} issue(s) across ${documents} document(s):`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}\n    → ${issue.message}`);
      if (issue.found) for (const f of issue.found) console.error(`      ${f}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-canonical-links] OK — ${documents} document(s) validated`,
  );
}

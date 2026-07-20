#!/usr/bin/env node
/**
 * validate-title-description
 *
 * Walks a built `dist/` directory and asserts that every emitted .html
 * document contains:
 *
 *   - exactly one <title> element with non-empty, non-whitespace text
 *   - exactly one <meta name="description"> tag with non-empty,
 *     non-whitespace content
 *   - neither value equal to the Lovable template defaults
 *     ("Lovable App" / "Lovable Generated Project"), which crawlers
 *     treat as boilerplate and demote in search
 *
 * Pure module + thin CLI so tests can drive it directly. Errors fail
 * the postbuild.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string; tag: "title" | "description"; message: string }} Issue */

const TEMPLATE_DEFAULT_TITLES = new Set(["lovable app"]);
const TEMPLATE_DEFAULT_DESCRIPTIONS = new Set(["lovable generated project"]);

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

const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/gi;
const DESCRIPTION_META_REGEX =
  /<meta\s+[^>]*name=["']description["'][^>]*>/gi;
const DESCRIPTION_META_REGEX_REVERSED =
  /<meta\s+[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/gi;
const CONTENT_ATTR_REGEX = /content=["']([^"']*)["']/i;

/**
 * Extract every <title> text value from a document.
 * @param {string} html
 * @returns {string[]}
 */
export function extractTitles(html) {
  const out = [];
  for (const match of html.matchAll(TITLE_REGEX)) {
    out.push(match[1]);
  }
  return out;
}

/**
 * Extract every meta description content value from a document.
 * Deduplicates tag matches so a tag matched by both orderings only
 * counts once.
 * @param {string} html
 * @returns {string[]}
 */
export function extractDescriptions(html) {
  const seen = new Set();
  const out = [];
  const collect = (regex) => {
    for (const match of html.matchAll(regex)) {
      const tag = match[0];
      if (seen.has(tag)) continue;
      seen.add(tag);
      const content = tag.match(CONTENT_ATTR_REGEX);
      out.push(content ? content[1] : "");
    }
  };
  collect(DESCRIPTION_META_REGEX);
  collect(DESCRIPTION_META_REGEX_REVERSED);
  return out;
}

/**
 * Validate one HTML document's <title> and meta description.
 * @param {{ file: string; html: string; distDir?: string }} args
 * @returns {Issue[]}
 */
export function validateDocument({ file, html, distDir }) {
  const issues = [];
  const relFile = distDir ? relative(distDir, file) : file;
  const push = (tag, message) => issues.push({ file: relFile, tag, message });

  const titles = extractTitles(html);
  if (titles.length === 0) {
    push("title", "document is missing a <title> element");
  } else if (titles.length > 1) {
    push("title", `document declares ${titles.length} <title> elements; exactly one is required`);
  } else {
    const trimmed = titles[0].trim();
    if (trimmed.length === 0) {
      push("title", "<title> is empty or whitespace-only");
    } else if (TEMPLATE_DEFAULT_TITLES.has(trimmed.toLowerCase())) {
      push("title", `<title> is the Lovable template default ("${trimmed}"); replace with a real page title`);
    }
  }

  const descriptions = extractDescriptions(html);
  if (descriptions.length === 0) {
    push("description", `document is missing a <meta name="description">`);
  } else if (descriptions.length > 1) {
    push(
      "description",
      `document declares ${descriptions.length} <meta name="description"> tags; exactly one is required`,
    );
  } else {
    const trimmed = descriptions[0].trim();
    if (trimmed.length === 0) {
      push("description", "<meta name=\"description\"> content is empty or whitespace-only");
    } else if (TEMPLATE_DEFAULT_DESCRIPTIONS.has(trimmed.toLowerCase())) {
      push(
        "description",
        `<meta name="description"> is the Lovable template default ("${trimmed}"); replace with a real page description`,
      );
    }
  }

  return issues;
}

/**
 * Validate every HTML document under `distDir`.
 * @param {string} distDir
 * @returns {{ issues: Issue[]; documents: number }}
 */
export function validateTitleDescription(distDir) {
  const files = collectHtmlFiles(distDir);
  const issues = [];
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    issues.push(...validateDocument({ file, html, distDir }));
  }
  return { issues, documents: files.length };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-title-description] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents } = validateTitleDescription(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-title-description] FAIL — ${issues.length} issue(s) across ${documents} document(s):`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}  [${issue.tag}]\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-title-description] OK — ${documents} document(s) have exactly one non-empty <title> and meta description`,
  );
}

#!/usr/bin/env node
/**
 * validate-jsonld-id-canonical-parity
 *
 * Walks a built `dist/` directory. For every emitted .html file:
 *
 *   1. Extracts every <script type="application/ld+json"> block and
 *      asserts the body is valid JSON (parse errors fail the build).
 *   2. Extracts the document's single <link rel="canonical"> href.
 *   3. For every JSON-LD node (top-level object or objects nested in a
 *      top-level array or `@graph`), asserts that when `@id` and/or
 *      `mainEntityOfPage` are present, they resolve to the canonical
 *      href exactly.
 *
 * Match rules for `@id` / `mainEntityOfPage`:
 *   - equals canonical, OR
 *   - equals canonical + "#<fragment>" (e.g. "#webpage", "#article")
 *   - mainEntityOfPage may also be an object of shape
 *     { "@type": "WebPage", "@id": <url> }; the nested @id is checked.
 *
 * Nodes without `@id` and without `mainEntityOfPage` are ignored —
 * this validator only enforces parity when the identifier is claimed.
 *
 * Pure module + thin CLI so tests can drive it directly. Errors fail
 * the postbuild.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string; scope: string; message: string }} Issue */

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

export function extractCanonicalHrefs(html) {
  const out = [];
  for (const match of html.matchAll(CANONICAL_LINK_REGEX)) {
    const href = match[0].match(HREF_ATTR_REGEX);
    if (href) out.push(href[1]);
  }
  return out;
}

const JSONLD_SCRIPT_REGEX =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractJsonLdBlocks(html) {
  const out = [];
  for (const match of html.matchAll(JSONLD_SCRIPT_REGEX)) {
    out.push(match[1]);
  }
  return out;
}

/**
 * Yield every JSON-LD "node" (object) that may carry an @id /
 * mainEntityOfPage — including entries in a top-level array or a
 * top-level `@graph`.
 */
function* iterNodes(root) {
  if (Array.isArray(root)) {
    for (const item of root) yield* iterNodes(item);
    return;
  }
  if (!root || typeof root !== "object") return;
  yield root;
  if (Array.isArray(root["@graph"])) {
    for (const item of root["@graph"]) yield* iterNodes(item);
  }
}

/**
 * Given a claimed URL (from @id or mainEntityOfPage), decide whether
 * it matches the canonical. Accepts either the exact canonical or the
 * canonical followed by "#<fragment>".
 */
export function matchesCanonical(url, canonical) {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url === canonical) return true;
  if (url.startsWith(canonical + "#")) return true;
  return false;
}

function extractMainEntityOfPageId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value["@id"] === "string") {
    return value["@id"];
  }
  return null;
}

/**
 * schema.org types that describe the page itself. Only these are
 * required to have `@id` = the page's canonical href. Entity types
 * like Organization / WebSite / SoftwareApplication legitimately use
 * site-level identifiers (e.g. "https://site.com/#organization") and
 * are intentionally exempt.
 */
export const PAGE_TYPES = new Set([
  "WebPage",
  "AboutPage",
  "CheckoutPage",
  "CollectionPage",
  "ContactPage",
  "FAQPage",
  "ItemPage",
  "MedicalWebPage",
  "ProfilePage",
  "QAPage",
  "RealEstateListing",
  "SearchResultsPage",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "TechArticle",
  "Report",
  "ScholarlyArticle",
  "Product",
  "HowTo",
  "Recipe",
  "Event",
]);

function nodeTypes(node) {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v) => typeof v === "string");
  return [];
}

function isPageTypedNode(node) {
  return nodeTypes(node).some((t) => PAGE_TYPES.has(t));
}

/**
 * Validate one HTML document.
 * @param {{ file: string; html: string; distDir?: string }} args
 * @returns {Issue[]}
 */
export function validateDocument({ file, html, distDir }) {
  const issues = [];
  const relFile = distDir ? relative(distDir, file) : file;
  const push = (scope, message) => issues.push({ file: relFile, scope, message });

  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) return issues;

  const canonicals = extractCanonicalHrefs(html);
  const canonical = canonicals.length === 1 ? canonicals[0] : null;

  blocks.forEach((raw, blockIdx) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      push(`jsonld[${blockIdx}]`, "empty <script type=\"application/ld+json\"> block");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      push(
        `jsonld[${blockIdx}]`,
        `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    let nodeIdx = 0;
    for (const node of iterNodes(parsed)) {
      const scope = `jsonld[${blockIdx}].node[${nodeIdx++}]`;
      const idValue = typeof node["@id"] === "string" ? node["@id"] : null;
      const mainId = extractMainEntityOfPageId(node.mainEntityOfPage);

      if (idValue === null && mainId === null) continue;

      if (canonical === null) {
        push(
          scope,
          `node declares @id/mainEntityOfPage but document has ${canonicals.length} canonical tag(s); need exactly one`,
        );
        continue;
      }

      if (idValue !== null && !matchesCanonical(idValue, canonical)) {
        push(
          scope,
          `@id "${idValue}" does not match canonical "${canonical}" (allowed: exact or "${canonical}#<fragment>")`,
        );
      }
      if (mainId !== null && !matchesCanonical(mainId, canonical)) {
        push(
          scope,
          `mainEntityOfPage "${mainId}" does not match canonical "${canonical}" (allowed: exact or "${canonical}#<fragment>")`,
        );
      }
    }
  });

  return issues;
}

/**
 * @param {string} distDir
 * @returns {{ issues: Issue[]; documents: number; blocks: number }}
 */
export function validateJsonLdIdCanonicalParity(distDir) {
  const files = collectHtmlFiles(distDir);
  const issues = [];
  let blocks = 0;
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    blocks += extractJsonLdBlocks(html).length;
    issues.push(...validateDocument({ file, html, distDir }));
  }
  return { issues, documents: files.length, blocks };
}

// ─────────────────────────── CLI ───────────────────────────
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = resolve(process.argv[2] ?? "dist");
  if (!existsSync(distDir)) {
    console.error(`[validate-jsonld-id-canonical-parity] dist directory not found: ${distDir}`);
    process.exit(1);
  }
  const { issues, documents, blocks } = validateJsonLdIdCanonicalParity(distDir);
  if (issues.length > 0) {
    console.error(
      `[validate-jsonld-id-canonical-parity] FAIL — ${issues.length} issue(s) across ${documents} document(s), ${blocks} JSON-LD block(s) checked:`,
    );
    for (const issue of issues) {
      console.error(`  ${issue.file}  [${issue.scope}]\n    → ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(
    `[validate-jsonld-id-canonical-parity] OK — ${blocks} JSON-LD block(s) across ${documents} document(s) parse cleanly and every @id/mainEntityOfPage matches its canonical href`,
  );
}
